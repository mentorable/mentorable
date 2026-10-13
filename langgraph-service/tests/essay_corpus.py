"""
Ordinary feedback on four sample drafts: what a careful writing teacher would
say, as observations and questions, never touching the wording. The data
behind test_ordinary_feedback_is_almost_never_refused in test_essay_rules.py,
which holds the rules to how little of this they may throw away.

Written in one sitting before any of it was run against the rules. Add to it
freely (a refused line a real review produced is the best kind of addition);
never take a line out to make the test pass. Each group belongs to one draft,
so a line may quote it. Ordinary school-life subjects only, all made up.
"""

BAND = (
    "At the state marching finals my slide stuck on the second note of the solo. Forty feet of field were "
    "between me and the nearest person, and nine thousand people were in the stands. I played the wrong partial "
    "and kept marching. Band teaches responsibility, commitment and the value of teamwork. Mr. Okafor did not "
    "say anything on the bus. My section leader, Priya, handed me her slide oil without looking up. The next "
    "Monday I asked to stay after rehearsal, and for six weeks I ran the solo against a metronome in the "
    "equipment room - forty times a night. We placed fourth. I have been first chair since sophomore year, but "
    "the night I think about is the one where I was the reason we lost points."
)
BAND_RECORD = {
    "activities": [{"title": "Marching Band", "position": "Second chair trombone", "organization": "Roosevelt High School",
                    "grade_levels": [9, 10, 11, 12], "hours_per_week": 10, "weeks_per_year": 20,
                    "description": "Trombone in the marching band; performed at regional and state competitions."}],
    "awards": [{"title": "State Marching Finals, 4th place", "level": "state", "grade_level": 11}],
}
BAND_PROMPT = ("The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you "
               "faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?")
BAND_LINES = [
    "The draft opens on the stuck slide and stays on the field for three sentences.",
    "What did the wrong note sound like from where you stood?",
    "This sentence names three things band teaches, and none of them shows up in the scene around it.",
    "What happened in the forty feet between you and the next person after the note went wrong?",
    "You write \"kept marching\" and the draft moves to the bus. What were the next sixteen counts like?",
    "Mr. Okafor is silent on the bus. What did you expect him to say?",
    "Priya hands you the slide oil \"without looking up\". What did you make of that then?",
    "The equipment room gets one clause. What was in it besides you and the metronome?",
    "Forty times a night for six weeks is the most concrete number in the draft.",
    "Who knew you were staying after rehearsal?",
    "The draft says \"We placed fourth\" and does not say how the band took it.",
    "Where were you sitting on the bus, and who was next to you?",
    "This passage is about what band teaches in general, and you are not in it.",
    "The paragraph tells what the director and the section leader did. What did you do on that ride home?",
    "For two sentences the people around you act and you are only watched.",
    "What did you say to Priya when you gave the oil back?",
    "The last sentence says which night you think about. It does not say what you think.",
    "What changed in how you practice between that night and now?",
    "The draft ends on the lost points. What did the six weeks give you that the fourth place did not?",
    "The lesson about teamwork is stated in the fourth sentence, before the bus and before the practice room.",
    "Why that night and not one of the nights the solo went right?",
    "What do you know about yourself after the equipment room that you did not know on the field?",
    "The prompt asks how the setback affected you. The draft shows what you did about it and stops there.",
    "The prompt asks what you learned from the experience, and the only sentence that answers is the general one about band.",
    "Which part of the prompt does the six weeks of practice answer for you?",
    "The setback itself takes the first three sentences, and it is clear what happened.",
    "The draft says you have been first chair since sophomore year. Your record lists second chair trombone.",
    "The record lists a fourth place at the state finals in grade 11, and the draft does not say which year this was.",
    "Is the solo night the same competition as the one on your awards list?",
    "This sentence repeats what your Marching Band entry says about competing at state.",
    "The fourth place is already on your awards list. What does the draft say about it that the list cannot?",
    "The draft is about one wrong note at the state finals and the six weeks of practice that followed it.",
    "It stays close to one night and names two people who were there.",
    "One sentence is general. Everything around it is a specific place and time.",
    "The story is told in order, from the field to the bus to the equipment room.",
    "Nothing in the draft says why you asked to stay after rehearsal.",
    "How did you ask? What words did you use with Mr. Okafor?",
    "Nine thousand people are in the stands. Was anyone there for you?",
    "The draft counts feet, people, weeks and repetitions. What could not be counted that night?",
    "What does a stuck slide feel like in your hand?",
    "Did the solo ever come back in a later show, and what happened then?",
    "You call yourself \"the reason we lost points\". Did anyone else say so?",
]

GROCERY = (
    "I started bagging at Delgado's Market the summer I turned sixteen. Mrs. Whitaker came through my line "
    "every Thursday with the same eleven items, and she counted them out loud. Customer service is about "
    "treating everyone with respect and going the extra mile. One Thursday she had ten. She stood at the end of "
    "my lane holding her purse and did not move, and the line behind her got long. My manager told me to keep "
    "things moving. I walked her back to aisle four and we found the tea she had forgotten. I got written up "
    "for leaving my register. Working taught me a lot about people. I still work Thursdays."
)
GROCERY_RECORD = {
    "activities": [{"title": "Delgado's Market", "position": "Courtesy clerk", "grade_levels": [11, 12],
                    "hours_per_week": 15, "description": "Bag groceries, return carts and help customers find items."}],
    "awards": [],
}
GROCERY_PROMPT = ("Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new "
                  "understanding of yourself or others.")
GROCERY_LINES = [
    "The eleven items counted out loud is a detail only someone at that register would have.",
    "What were the eleven items?",
    "This sentence describes customer service in general. It could hang on the wall of any store.",
    "What did Mrs. Whitaker's face do when she got to ten?",
    "\"The line behind her got long\" is all the draft says about the other customers. What were they doing?",
    "What exactly did your manager say, and where was he standing?",
    "The walk to aisle four takes one sentence. What did the two of you talk about on the way?",
    "The draft says \"we found the tea\". Who saw it first?",
    "What did the write-up say?",
    "How long were you away from the register?",
    "\"Working taught me a lot about people\" does not say what it taught or which people.",
    "What is one thing you understand about Mrs. Whitaker now that you did not that summer?",
    "Until the walk to aisle four, the draft is about her routine. That is the first thing you do in it.",
    "Your manager gives an instruction and the draft does not say what went through your head.",
    "In this passage the store is the subject. Where are you?",
    "What did you weigh in the second before you left the lane?",
    "The draft says you still work Thursdays and ends. Why Thursdays?",
    "The realization the prompt asks about is never named. What did you understand after that Thursday?",
    "The point is given as a general statement near the end, after the story has already made it more precisely.",
    "What would you do if it happened again this week?",
    "Did getting written up change what you thought you had done?",
    "The prompt asks for a new understanding of yourself or others. Which is this, for you?",
    "The draft tells the event the prompt asks for. The period of growth after it is one sentence long.",
    "Your record lists you as a courtesy clerk in grades 11 and 12. The draft says you started the summer you turned sixteen.",
    "The record says fifteen hours a week. The draft only mentions Thursdays. Are there other shifts?",
    "This passage restates the description on your activity entry, down to helping customers find items.",
    "What happened on that Thursday that the entry on your activities list has no room for?",
    "The draft is about one Thursday at the register and a customer who came up one item short.",
    "It names a store, a customer, an aisle and what the choice cost you.",
    "Two sentences are general statements about work. The rest is one afternoon.",
    "The draft never says how old Mrs. Whitaker is or whether she shops alone.",
    "Does she still come through your line?",
    "What did she say when you found the tea?",
    "The manager appears once. What happened the next time you saw him?",
    "You write that she \"did not move\". How long did that last?",
    "What were you bagging when you noticed she had stopped?",
    "Who covered your register while you were gone?",
    "The draft treats the write-up as the cost. Was there anything you gained that day that you could hold?",
    "What do the other baggers do on Thursdays when she comes in?",
    "The first sentence gives your age and the store. Why did you take the job?",
]

MOVE = (
    "We moved from Tucson to a town outside Columbus the week before tenth grade started. In the cafeteria I "
    "ate at the end of a table of sophomores who had known each other since kindergarten. Moving is hard for "
    "everyone, and it forces a person to grow. A teacher, Ms. Brandt, told me the debate team needed a fourth. "
    "I had never argued with anyone out loud. At my first tournament I lost every round and my partner, Theo, "
    "bought me fries anyway. By spring I was captain of the novice squad. My mother still keeps a Tucson area "
    "code on her phone. I answer it when she cannot."
)
MOVE_RECORD = {
    "activities": [{"title": "Debate Team", "position": "Novice squad member", "grade_levels": [10, 11],
                    "hours_per_week": 6, "weeks_per_year": 28}],
    "awards": [{"title": "Novice Speaker Award", "level": "school", "grade_level": 10}],
}
MOVE_PROMPT = ("Some students have a background, identity, interest, or talent that is so meaningful they believe their "
               "application would be incomplete without it. If this sounds like you, then please share your story.")
MOVE_LINES = [
    "The end of the cafeteria table is a place the reader can see.",
    "What did the sophomores at that table talk about?",
    "This sentence about moving being hard for everyone could come from anyone who has moved.",
    "What was hard about it for you, in the first week?",
    "Ms. Brandt appears for one sentence. Why do you think she asked you?",
    "\"I had never argued with anyone out loud\" is a striking thing to say about yourself. Who did you argue with silently?",
    "You lost every round. Which loss do you remember best?",
    "What did Theo say when he handed you the fries?",
    "Between the first tournament and spring the draft skips several months. What happened in one of them?",
    "What was the first round you won, and what was the argument?",
    "The last two sentences are about your mother's phone, and nothing before them prepares for it.",
    "Who calls the Tucson number?",
    "What do you say when you answer it?",
    "The draft says \"when she cannot\". Why can she not?",
    "The paragraph about the cafeteria has you in it. The sentence after it is about people in general.",
    "In the debate section the teacher, the team and your partner all act. What did you decide?",
    "What did you want from the table of sophomores?",
    "The draft has two stories, debate and the phone, and it does not say how they belong together.",
    "What does answering that phone have to do with learning to argue out loud?",
    "The draft stops on the phone call. What does it add up to for you?",
    "Is the thing the prompt asks about the move, the debate, or what you do for your mother?",
    "The prompt asks for something your application would be incomplete without. The draft offers three candidates and settles on none.",
    "Which of the three would you miss most if it were not in the draft?",
    "The draft says you were captain of the novice squad by spring. Your record lists you as a novice squad member.",
    "Your record has a Novice Speaker Award in grade 10. The draft does not mention it. Was that the same spring?",
    "The record lists debate for grades 10 and 11. Are you still on the team?",
    "The sentence about becoming captain says what your activity entry says and nothing more.",
    "Your other essay also tells about the first tournament. Here it takes one sentence.",
    "The draft is about arriving in a new town before tenth grade and finding a place on the debate team.",
    "It names a teacher, a partner and a cafeteria table, and it ends somewhere different from where it began.",
    "One sentence is a general claim about moving. The rest is yours.",
    "The time between September and spring passes in a single line.",
    "What did the town outside Columbus look like the week you got there?",
    "What did you leave in Tucson that you still think about?",
    "How did the sophomores find out you had joined debate?",
    "What is it like to lose every round and still be asked back?",
    "The draft never says what a fourth does on a debate team.",
    "Did your mother come to a tournament?",
    "You write that Theo bought fries \"anyway\". What did that word mean to you that day?",
    "What is the first thing you argued out loud at home after joining?",
]

GARDEN = (
    "Westbrook University has one of the best chemistry departments in the country. I have loved chemistry "
    "since I was little. Last year our community garden's tomatoes came up yellow, and I borrowed a soil kit "
    "from my chemistry teacher to find out why. The pH was fine. The nitrogen was not. I spent three Saturdays "
    "mixing compost ratios in five-gallon buckets and writing the numbers on the shed wall in chalk. "
    "Westbrook's undergraduate research program would let me keep asking questions like that. I also plan to "
    "join clubs and meet new people."
)
GARDEN_RECORD = {
    "activities": [{"title": "Greenway Community Garden", "position": "Volunteer", "grade_levels": [10, 11],
                    "hours_per_week": 3, "description": "Weed, water and harvest vegetables for the food pantry."}],
    "awards": [],
}
GARDEN_PROMPT = "Why do you want to study your chosen major at Westbrook?"
GARDEN_SCHOOL = "Westbrook University"
GARDEN_LINES = [
    "The draft says the department is one of the best in the country and gives no reason of your own for choosing it.",
    "\"I have loved chemistry since I was little\" covers many years in eight words. What is the first experiment you remember?",
    "The yellow tomatoes are where the draft becomes specific.",
    "What did the leaves look like up close?",
    "What did your chemistry teacher say when you asked for the kit?",
    "\"The pH was fine. The nitrogen was not.\" What did you do in the minute after you read that result?",
    "Three Saturdays of buckets is the heart of the draft. What went wrong on the first one?",
    "What were the numbers on the shed wall?",
    "Who else at the garden saw the chalk?",
    "Did the tomatoes come back?",
    "The first sentence is about the university and the second is a general statement. You arrive in the third.",
    "The last sentence could be written by any student about any school.",
    "What question from the garden are you still asking?",
    "The draft says the research program would let you keep asking questions like that. Which question?",
    "You say Westbrook has one of the best departments. What have you seen or read of it yourself?",
    "The prompt asks why this major at this school. The garden answers the first half.",
    "The part of the prompt about this school is answered with a ranking and the name of a program.",
    "What would you want to test first with more than a soil kit?",
    "The draft does not say why the yellow tomatoes mattered to you and not to the other volunteers.",
    "What did you feel when the ratio finally worked, if it did?",
    "The point of the garden story is left unstated. What did those Saturdays tell you about how you like to work?",
    "Your record lists weeding, watering and harvesting at Greenway Community Garden. The soil testing is not on it.",
    "The record says three hours a week in grades 10 and 11. Were the three Saturdays part of those hours?",
    "This passage tells far more than your activity entry does.",
    "The sentence about joining clubs repeats nothing from your record and tells nothing about you either.",
    "The draft is about a soil problem in a community garden and three Saturdays spent working it out.",
    "It names a test, a result and a method, and it ties them to one program.",
    "Two sentences are about the university in general terms. Four are about the buckets.",
    "Why chalk, and why the shed wall?",
    "Who was the food from that garden for?",
    "How did you decide which ratios to try?",
    "What did you do with the result once you had it?",
    "The teacher lends the kit and disappears from the draft. Did you report back?",
    "What surprised you about nitrogen?",
    "The draft moves from tomatoes to a research program in one step. What is the step for you?",
    "Is there a question you could not answer with the kit?",
    "You write \"since I was little\". How little, and what were you doing?",
    "What did the garden smell like on the third Saturday?",
    "When did the soil stop being a chore and start being a puzzle?",
    "What would the other volunteers say you did that month?",
]

# Reasons for a cut, as a review of an over-length draft would give them.
CUT_REASONS = [
    "This states in general what the bus scene already shows.",
    "The draft says this again two sentences later.",
    "The equipment room scene makes this point without it.",
    "This is background the story does not lean on anywhere else.",
    "The same idea closes the draft, in more specific terms.",
    "Nothing later refers back to this.",
    "This summarizes a scene the reader has just watched.",
    "It repeats the activity entry on your record.",
    "The paragraph holds together without this sentence.",
    "This is about the store's policy, and the story is about one afternoon.",
    "The essay already told this in its first paragraph.",
    "This explains a feeling the scene makes plain.",
    "This general statement comes after the specific story that shows it.",
    "The draft gives this fact twice.",
    "This is the third example of the same thing.",
    "The story would lose nothing the prompt asks about.",
]

# Questions on an ideas card, as find_areas would write them.
AREA_QUESTIONS = [
    "What is one rehearsal you still remember, and why that one?",
    "Who taught you to oil a slide?",
    "What do you do in the ten minutes before a show starts?",
    "What happened the first time you bagged for someone you knew?",
    "Which customer do you look for on a shift?",
    "What was the hardest part of the first month after the move?",
    "What did you notice about how people argue once you joined debate?",
    "When have you changed your mind in the middle of a round?",
    "What have you grown in the garden that surprised you?",
    "Who eats what you harvest, and have you met them?",
    "What question keeps coming back when you are in the lab?",
    "What do you do at home that nobody at school knows about?",
    "When did you last teach someone younger how to do something?",
    "What is a problem you solved that nobody asked you to solve?",
    "Where were you the last time you lost track of time?",
]

# (the draft, its prompt, its record, the lines, the school a supplement names)
GROUPS = [
    (BAND, BAND_PROMPT, BAND_RECORD, BAND_LINES, ""),
    (GROCERY, GROCERY_PROMPT, GROCERY_RECORD, GROCERY_LINES, ""),
    (MOVE, MOVE_PROMPT, MOVE_RECORD, MOVE_LINES, ""),
    (GARDEN, GARDEN_PROMPT, GARDEN_RECORD, GARDEN_LINES, GARDEN_SCHOOL),
]
