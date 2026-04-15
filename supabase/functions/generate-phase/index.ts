import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'
import { mnmSearch, mnmSearchSummaryForPrompt } from '../_shared/onet.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const { userId, roadmapId, phaseNumber } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if this phase already exists for this roadmap (prevent duplicates)
    const { data: existingPhase } = await supabase
      .from('roadmap_phases')
      .select('*, tasks:roadmap_tasks(*)')
      .eq('roadmap_id', roadmapId)
      .eq('phase_number', phaseNumber)
      .limit(1)

    if (existingPhase && existingPhase.length > 0) {
      return new Response(JSON.stringify({
        success: true,
        phase: existingPhase[0],
        tasksCount: existingPhase[0].tasks?.length || 0,
        confidenceUpdate: null,
        note: 'Phase already existed, returning existing'
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Load student profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Load roadmap
    const { data: roadmap } = await supabase
      .from('roadmaps')
      .select('*')
      .eq('id', roadmapId)
      .single()

    // Load all completed phases with their tasks
    const { data: completedPhases } = await supabase
      .from('roadmap_phases')
      .select('*, tasks:roadmap_tasks(*)')
      .eq('roadmap_id', roadmapId)
      .eq('status', 'completed')
      .order('phase_number', { ascending: true })

    // Load confidence history
    const { data: confidenceHistory } = await supabase
      .from('confidence_history')
      .select('*')
      .eq('roadmap_id', roadmapId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Build context from completed tasks
    const completedTaskSummary = completedPhases?.map(phase => ({
      phase: phase.phase_number,
      title: phase.title,
      focus: phase.focus,
      tasks: phase.tasks?.map((t: any) => ({
        title: t.title,
        status: t.status,
        not_for_me: t.not_for_me,
        week: t.week_number
      }))
    })) || []

    // Count skipped and flagged tasks
    const allTasks = completedPhases?.flatMap(p => p.tasks || []) || []
    const completedCount = allTasks.filter((t: any) => t.status === 'completed').length
    const skippedCount = allTasks.filter((t: any) => t.status === 'skipped').length
    const flaggedCount = allTasks.filter((t: any) => t.not_for_me).length

    const isDiscovery = roadmap.mode === 'discovery'

    let onetCareerContext = ''
    if (roadmap.mode === 'career') {
      const raw =
        (typeof roadmap.career_direction === 'string' && roadmap.career_direction.trim()) ||
        (Array.isArray(profile.career_matches) && profile.career_matches[0]) ||
        ''
      const term = typeof raw === 'string' ? raw.trim() : ''
      if (term) {
        try {
          const search = await mnmSearch(term)
          const summary = mnmSearchSummaryForPrompt(search)
          if (summary) {
            onetCareerContext = `\n## O*NET (official occupation titles related to this direction)\n${summary}\n`
          }
        } catch (e) {
          if (e instanceof Error && e.name === 'OnetRateLimit') {
            console.warn('O*NET rate limit; continuing without O*NET block')
          } else {
            console.warn('O*NET context skipped:', e)
          }
        }
      }
    }

    const systemPrompt = `
You are Mentorable's roadmap engine. You generate personalized weekly career guidance tasks for high school students.

Your job is to generate ONE phase of a roadmap. A phase consists of 2 weeks, each with 3-4 tasks.

RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no backticks.
2. Tasks must be specific and actionable -- not "research careers" but "Watch this 15-minute video: What does a software engineer actually do? Then write 3 things that surprised you."
3. Estimated time must be realistic for a high schooler -- 15 to 60 minutes per task max.
4. ${isDiscovery
  ? 'This is a DISCOVERY ROADMAP. Tasks should help the student explore and understand different fields. Start with videos, articles, and reflection exercises. Do not push toward a specific career. The goal is self-discovery.'
  : 'This is a CAREER ROADMAP. The student has chosen a direction. Tasks should be field-specific, skill-building, and progressively more advanced. Each task should move them closer to their chosen career.'
}
5. Consider their completion history -- if they skipped tasks, make the next ones more engaging. If they flagged tasks as "not for me", avoid that territory.
6. Each phase should have a clear theme and build on the previous one.
7. Resource links should be left as empty strings "" -- they will be filled in later.
8. Skill gained should be left as empty string "" -- it will be filled in later.
9. Keep task descriptions warm and encouraging -- this student may feel uncertain about their future.
`

    const userPrompt = `
Generate Phase ${phaseNumber} of this student's roadmap.

## STUDENT PROFILE
- Grade: ${profile.grade_level}
- Age: ${profile.age}
- Location: ${profile.location_general}
- Strengths: ${JSON.stringify(profile.strengths)}
- Interests: ${JSON.stringify(profile.interests)}
- Work style: ${profile.work_style}
- Career matches from onboarding: ${JSON.stringify(profile.career_matches)}
- Onboarding summary: ${profile.onboarding_summary}
${onetCareerContext}
## ROADMAP STATE
- Mode: ${roadmap.mode}
- Career direction: ${roadmap.career_direction || 'Not yet chosen -- still exploring'}
- Current confidence score: ${roadmap.confidence_score}/100
- Phase being generated: ${phaseNumber}

## COMPLETED PHASES SUMMARY
${JSON.stringify(completedTaskSummary, null, 2)}

## TASK COMPLETION STATS
- Tasks completed: ${completedCount}
- Tasks skipped: ${skippedCount}
- Tasks flagged "not for me": ${flaggedCount}

## RECENT CONFIDENCE CHANGES
${JSON.stringify(confidenceHistory?.slice(0, 5), null, 2)}

## OUTPUT FORMAT
Return this exact JSON structure:

{
  "phase": {
    "phase_number": ${phaseNumber},
    "title": "Short phase title",
    "focus": "One sentence describing what this phase is about",
    "duration_weeks": 2,
    "weeks": [
      {
        "week_number": 1,
        "tasks": [
          {
            "title": "Task title",
            "description": "Specific, actionable description of exactly what to do",
            "estimated_time": "~20 mins",
            "skill_gained": "",
            "resource_url": "",
            "resource_label": ""
          }
        ]
      },
      {
        "week_number": 2,
        "tasks": [
          {
            "title": "Task title",
            "description": "Specific, actionable description of exactly what to do",
            "estimated_time": "~30 mins",
            "skill_gained": "",
            "resource_url": "",
            "resource_label": ""
          }
        ]
      }
    ]
  },
  "confidence_update": {
    "delta": 0,
    "reason": "Why confidence is changing (or not) based on previous phase performance",
    "trigger": "phase_completed"
  }
}

Generate 3-4 tasks per week. Make them varied -- mix of watching, reading, doing, and reflecting.
${isDiscovery ? 'For discovery mode, include at least one task per week that exposes the student to a different field than the last phase.' : ''}
`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(clean)

    const { phase, confidence_update } = result

    // Save phase to DB
    const { data: savedPhase, error: phaseInsertError } = await supabase
      .from('roadmap_phases')
      .insert({
        roadmap_id: roadmapId,
        user_id: userId,
        phase_number: phase.phase_number,
        title: phase.title,
        focus: phase.focus,
        duration_weeks: Number(phase.duration_weeks) || 2,
        status: 'active'
      })
      .select()
      .single()

    if (phaseInsertError || !savedPhase) {
      throw new Error(`Phase insert failed: ${phaseInsertError?.message || phaseInsertError?.code || 'null response'}`)
    }

    // Save tasks to DB
    const tasksToInsert = phase.weeks.flatMap((week: any) =>
      week.tasks.map((task: any) => ({
        phase_id: savedPhase!.id,
        roadmap_id: roadmapId,
        user_id: userId,
        week_number: week.week_number,
        title: task.title,
        description: task.description,
        estimated_time: task.estimated_time,
        skill_gained: task.skill_gained || null,
        resource_url: task.resource_url || null,
        resource_label: task.resource_label || null,
        status: 'not_started'
      }))
    )

    await supabase.from('roadmap_tasks').insert(tasksToInsert)

    // Apply confidence update
    if (confidence_update && confidence_update.delta !== 0) {
      const newScore = Math.min(100, Math.max(0, roadmap.confidence_score + confidence_update.delta))

      await supabase
        .from('roadmaps')
        .update({
          confidence_score: newScore,
          current_phase_number: phaseNumber,
          updated_at: new Date().toISOString()
        })
        .eq('id', roadmapId)

      await supabase
        .from('confidence_history')
        .insert({
          roadmap_id: roadmapId,
          user_id: userId,
          previous_score: roadmap.confidence_score,
          new_score: newScore,
          delta: confidence_update.delta,
          reason: confidence_update.reason,
          trigger: confidence_update.trigger
        })
    } else {
      await supabase
        .from('roadmaps')
        .update({
          current_phase_number: phaseNumber,
          updated_at: new Date().toISOString()
        })
        .eq('id', roadmapId)
    }

    return new Response(JSON.stringify({
      success: true,
      phase: savedPhase,
      tasksCount: tasksToInsert.length,
      confidenceUpdate: confidence_update
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (err: any) {
    console.error('Phase generation error:', err)
    return new Response(JSON.stringify({ error: 'Phase generation failed', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
