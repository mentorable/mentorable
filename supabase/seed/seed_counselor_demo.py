#!/usr/bin/env python3
"""Print the SQL that builds the counselor demo school.

    python3 supabase/seed/seed_counselor_demo.py > demo.sql
    python3 supabase/seed/seed_counselor_demo.py --counselor-email you@example.com > demo.sql
    supabase db query --linked -f demo.sql

This script only writes text. It opens no connection and reads no secret; you
read the SQL, then run it yourself. It needs 20261012_counselor.sql applied.

What the SQL makes: one school, "Riverbend High School (demo)", and 25 made-up
students linked to it, with records, college lists, quests, essay progress,
mixed sharing choices (10 share everything, 10 share one to three sections, 5
share nothing) and 6 meeting requests (4 waiting, 1 confirmed for next week,
1 declined). Every person, college and detail here is invented.

Nobody can sign in as a demo student: the accounts have no password, an
address at demo.mentorable.invalid (a domain that cannot receive mail), no
confirmed email, and a ban until 2100. Their profiles and the school are
flagged is_demo.

The same SQL every time (ids come from uuid5 of fixed names), and safe to run
again: it deletes its own earlier students first and inserts with ON CONFLICT
DO NOTHING. The one thing drawn fresh is the school's join code, on the first
run only. Dates are relative to the moment the SQL runs (streaks, check-ins,
"next week"), so run it again shortly before a demo.

--counselor-email adds a statement that makes that existing account a
counselor of the demo school (moving them if they had set up another school).
Sign up at /counselor with that address first.

The demo school takes no real student. That counselor login is shared with
judges and the school's join code is on screen in every walkthrough, so a real
student who typed the code would be showing their name, and whatever they
ticked, to everyone who holds the password. join_school therefore answers the
demo code like a wrong one for every account that is not flagged as demo. The
cost: a judge cannot sign up and join the demo school to try the student side.
To show that side (joining, the switches, a meeting request), flag one test
account of your own by hand, as the owner:

    UPDATE public.profiles SET is_demo = true
     WHERE id = (SELECT id FROM auth.users WHERE lower(email) = lower('your-test-student@example.com'));

Nobody can set that flag on themselves. The cleanup script unlinks such an
account (the school goes) but does not delete or unflag it, since its address
is not at demo.mentorable.invalid: set is_demo back to false the same way.

--no-transaction leaves out BEGIN and COMMIT, for running the statements inside
a transaction of your own (the rolled-back check does this).

To remove all of it: supabase/seed/clear_counselor_demo.sql
"""

import argparse
import json
import re
import sys
import uuid

DOMAIN = "demo.mentorable.invalid"
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, DOMAIN)
SCHOOL_NAME = "Riverbend High School (demo)"
CLASS_OF = {12: 2027, 11: 2028, 10: 2029, 9: 2030}   # the 2026-27 school year
ESSAY_TEXT = "Demo placeholder for a made-up student. No real essay is stored here."
PROMPT_TEXT = "Demo placeholder prompt."
CHECKIN_TEXT = "Demo check-in for a made-up student. Nobody wrote this."


def uid(*parts):
    """A fixed id for a named thing, the same on every run."""
    return str(uuid.uuid5(NAMESPACE, "/".join(str(p) for p in parts)))


SCHOOL_ID = uid("school", "riverbend-high")


# ── Invented colleges ─────────────────────────────────────────────────────────
# (name, city, state, admit rate, net price, SAT 25/75, ACT 25/75, enrollment).
# None of these exist; their ids sit far above any real IPEDS unit id.
COLLEGES = [
    ("Halvorsen University", "Port Averill", "MA", 0.07, 19500, 1480, 1570, 33, 35, 7100),              # 0
    ("Calder Institute of Technology", "Stonebridge", "CA", 0.09, 21800, 1500, 1580, 34, 36, 4600),      # 1
    ("Wexcombe College", "Larkfield", "VT", 0.14, 24300, 1400, 1520, 31, 34, 2100),                      # 2
    ("Marlowe University", "East Harrow", "NY", 0.18, 27900, 1380, 1510, 31, 34, 11800),                 # 3
    ("Pacific Meridian University", "Corazon Bay", "CA", 0.26, 20400, 1300, 1470, 29, 33, 16400),        # 4
    ("Thistlewood College", "Thistlewood", "OH", 0.33, 23100, 1250, 1420, 27, 32, 2400),                 # 5
    ("University of Northmere", "Northmere", "MI", 0.38, 17400, 1220, 1400, 26, 31, 31200),              # 6
    ("Hollis Polytechnic", "Greyhaven", "NY", 0.41, 25600, 1270, 1450, 28, 33, 6900),                    # 7
    ("Lake Verity University", "Verity", "WI", 0.47, 18900, 1180, 1350, 24, 30, 9800),                   # 8
    ("Castellan State University", "Castellan", "TX", 0.52, 15800, 1130, 1320, 23, 29, 38400),           # 9
    ("Brightwater College", "Brightwater", "OR", 0.58, 26400, 1120, 1310, 22, 28, 1900),                 # 10
    ("Saint Brannoc College", "Fenwick", "MN", 0.63, 22700, 1090, 1280, 21, 27, 3100),                   # 11
    ("Riverbend State University", "Riverbend", "IL", 0.71, 13900, 1010, 1220, 19, 26, 21500),           # 12
    ("Ashgrove State College", "Ashgrove", "PA", 0.78, 14600, 980, 1180, 18, 24, 8700),                  # 13
    ("Prairie Crest University", "Dellwood", "KS", 0.84, 12800, 960, 1170, 18, 24, 14300),               # 14
    ("Twin Forks Community College", "Riverbend", "IL", 1.0, 6200, None, None, None, None, 6400),        # 15
]

R, T, L = "reach", "target", "likely"
ALL = ("college_list", "portfolio", "quest", "essays")


def A(category, title, position, organization, description, grades, timing, hours, weeks):
    return dict(category=category, title=title, position=position, organization=organization,
                description=description, grades=grades, timing=timing, hours=hours, weeks=weeks)


def Q(title, summary, kind, status, milestones, done=0, extra=0, last=None, streak=0, best=0, minutes=30):
    """A quest. `milestones` is [(title, days)]; the first `done` are finished and
    `extra` tasks are done in the next one. `last` is how many days ago the newest
    check-in was (for a paused quest, also when it was paused)."""
    return dict(title=title, summary=summary, kind=kind, status=status, milestones=milestones, done=done,
                extra=extra, last=last, streak=streak, best=best, minutes=minutes)


def E(kind, status, words, limit=650, college=None, prompt=None, days=2):
    return dict(kind=kind, status=status, words=words, limit=limit, college=college, prompt=prompt, days=days)


# ── 25 made-up students ───────────────────────────────────────────────────────
# share: which of the four sections the student has switched on.
# colleges: (index into COLLEGES, category, where the category came from).
# scores: (test, score, subject, date, sections).
# awards: (title, level, grade, description). courses: (name, level, grade, planned).
STUDENTS = [
    # ── Grade 12 ──
    dict(first="Marisol", last="Quintero", grade=12, gpa=(3.92, 4.41), majors=["Biology", "Public Health"],
         share=ALL,
         activities=[
             A("Career Oriented", "HOSA Future Health Professionals", "Chapter President", "Riverbend High School",
               "Run weekly meetings for 40 members and organized two blood drives.", [10, 11, 12], "school_year", 4, 34),
             A("Community Service (Volunteer)", "Hospital volunteer", "Patient transport volunteer",
               "Riverbend Community Hospital", "Move patients between units and restock supply rooms on weekends.",
               [11, 12], "all_year", 4, 46),
             A("Athletics: JV/Varsity", "Cross country", "Varsity runner", "Riverbend High School",
               "Three seasons of varsity. Team captain senior year.", [9, 10, 11, 12], "school_year", 10, 14),
             A("Academic", "Peer tutoring", "Biology and chemistry tutor", "Riverbend High School",
               "Tutor ninth and tenth graders twice a week after school.", [11, 12], "school_year", 2, 30),
         ],
         awards=[("HOSA State Conference, second place in Medical Terminology", "state", 11, ""),
                 ("AP Scholar", "national", 11, "")],
         courses=[("AP Biology", "ap", 11, False), ("AP Chemistry", "ap", 11, False),
                  ("AP English Language", "ap", 11, False), ("AP Calculus AB", "ap", 11, False),
                  ("AP Statistics", "ap", 12, False), ("AP English Literature", "ap", 12, False),
                  ("Honors Anatomy and Physiology", "honors", 12, False), ("Spanish IV", "regular", 12, False)],
         scores=[("sat", 1440, None, "2026-08-22", {"reading_writing": 720, "math": 720}),
                 ("ap", 5, "Biology", "2026-05-11", None), ("ap", 4, "Chemistry", "2026-05-05", None)],
         colleges=[(3, R, "suggested"), (4, R, "student"), (5, T, "suggested"), (6, T, "suggested"),
                   (7, T, "suggested"), (8, T, "student"), (12, L, "suggested"), (13, L, "suggested")],
         quest=Q("Shadow three clinicians and write up what I learned",
                 "Arrange three shadowing days in different specialties and turn the notes into one reflection.",
                 "other", "active",
                 [("Line up the three shadowing days", 4), ("Shadow a family doctor", 3),
                  ("Shadow a physical therapist", 3), ("Shadow an ER nurse", 3), ("Write the reflection", 5)],
                 done=3, extra=1, last=0, streak=11, best=14),
         essays=[E("personal_statement", "revising", 612, prompt="5", days=1),
                 E("supplement", "done", 248, 250, college=3, days=6),
                 E("supplement", "drafting", 130, 300, college=4, days=3),
                 E("supplement", "idea", 0, 200, college=6, days=9)]),

    dict(first="Devon", last="Ashby", grade=12, gpa=(3.71, 4.18), majors=["Computer Science", "Computer Engineering"],
         share=ALL,
         activities=[
             A("Robotics", "Robotics team", "Lead programmer", "Riverbend High School",
               "Wrote the autonomous routines for two competition seasons.", [10, 11, 12], "school_year", 9, 30),
             A("Computer/Technology", "Attendance app for the front office", "Developer", None,
               "Built a sign-in web app the office now uses for late arrivals.", [11, 12], "all_year", 3, 40),
             A("Work (Paid)", "Grocery store", "Stock clerk", "Harlow's Market",
               "Evening and weekend shifts.", [11, 12], "all_year", 12, 48),
         ],
         awards=[("Regional robotics championship, finalist alliance", "regional", 11, "")],
         courses=[("AP Computer Science A", "ap", 10, False), ("AP Physics 1", "ap", 11, False),
                  ("AP Calculus AB", "ap", 11, False), ("AP Calculus BC", "ap", 12, False),
                  ("AP Physics C: Mechanics", "ap", 12, False), ("English 12", "regular", 12, False)],
         scores=[("sat", 1510, None, "2026-06-06", {"reading_writing": 720, "math": 790}),
                 ("ap", 5, "Computer Science A", "2025-05-07", None), ("ap", 4, "Physics 1", "2026-05-15", None)],
         colleges=[(0, R, "suggested"), (1, R, "suggested"), (2, R, "suggested"), (3, R, "suggested"),
                   (4, R, "student"), (7, T, "suggested")],
         quest=Q("Ship version two of the attendance app",
                 "Add a teacher view and hand the project to next year's maintainer.",
                 "passion_project", "active",
                 [("List what the office asked for", 2), ("Build the teacher view", 6),
                  ("Test with two teachers", 3), ("Write the handover notes", 3)],
                 done=1, extra=2, last=11, streak=0, best=9),
         essays=[E("personal_statement", "drafting", 388, prompt="1", days=12),
                 E("supplement", "drafting", 90, 250, college=1, days=12),
                 E("supplement", "idea", 0, 150, college=0, days=20)]),

    dict(first="Priya", last="Raman", grade=12, gpa=(3.98, 4.52), majors=["Political Science", "Economics"],
         share=ALL,
         activities=[
             A("Debate/Speech", "Debate team", "Captain", "Riverbend High School",
               "Lincoln-Douglas debater for four years. Coach the novice squad.", [9, 10, 11, 12], "school_year", 8, 32),
             A("Student Govt./Politics", "City youth council", "Vice chair", "City of Riverbend",
               "Advise the council on the youth bus pass and the skate park plan.", [11, 12], "all_year", 3, 40),
             A("Academic", "Model United Nations", "Head delegate", "Riverbend High School",
               "Led a delegation of 14 to two conferences.", [10, 11, 12], "school_year", 3, 24),
             A("Religious", "Temple youth group", "Volunteer", None,
               "Help run the weekend meal program.", [9, 10, 11, 12], "all_year", 2, 44),
         ],
         awards=[("State debate tournament, semifinalist", "state", 11, ""),
                 ("National Merit Commended Student", "national", 12, ""),
                 ("AP Scholar with Distinction", "national", 11, "")],
         courses=[("AP US History", "ap", 11, False), ("AP English Language", "ap", 11, False),
                  ("AP US Government", "ap", 11, False), ("AP Macroeconomics", "ap", 12, False),
                  ("AP English Literature", "ap", 12, False), ("AP Calculus AB", "ap", 12, False),
                  ("French IV Honors", "honors", 12, False)],
         scores=[("sat", 1540, None, "2026-03-14", {"reading_writing": 780, "math": 760}),
                 ("ap", 5, "US Government", "2026-05-04", None), ("ap", 5, "US History", "2026-05-08", None),
                 ("ap", 5, "English Language", "2026-05-13", None)],
         colleges=[(0, R, "suggested"), (2, R, "suggested"), (3, R, "suggested"), (4, T, "suggested"),
                   (5, T, "suggested"), (6, T, "suggested"), (7, T, "student"), (12, L, "suggested"),
                   (9, L, "suggested")],
         quest=Q("Publish a voter guide for first-time voters at school",
                 "Research the local ballot, write a plain two-page guide, and get it into every senior homeroom.",
                 "passion_project", "completed",
                 [("Read the ballot and pick what to cover", 3), ("Interview the county clerk's office", 2),
                  ("Write and fact-check the guide", 5), ("Print and hand it out", 2)],
                 done=4, last=9, streak=0, best=12),
         essays=[E("personal_statement", "done", 648, prompt="3", days=8),
                 E("supplement", "done", 247, 250, college=0, days=10),
                 E("supplement", "done", 398, 400, college=2, days=7),
                 E("supplement", "done", 150, 150, college=3, days=5),
                 E("supplement", "revising", 290, 300, college=4, days=1),
                 E("supplement", "drafting", 80, 250, college=6, days=1)]),

    dict(first="Tobias", last="Lindgren", grade=12, gpa=(2.9, None), majors=["Automotive Technology"],
         share=("college_list", "portfolio"),
         activities=[
             A("Work (Paid)", "Family repair shop", "Mechanic's helper", "Lindgren Auto Repair",
               "Oil changes, brakes and inventory after school and on Saturdays.", [10, 11, 12], "all_year", 15, 50),
             A("Career Oriented", "Auto shop club", "Member", "Riverbend High School",
               "Rebuilt a small-block engine with four classmates.", [11, 12], "school_year", 3, 30),
             A("Athletics: JV/Varsity", "Wrestling", "JV wrestler", "Riverbend High School",
               None, [9, 10], "school_year", 8, 14),
         ],
         awards=[],
         courses=[("Automotive Technology I", "regular", 11, False), ("Automotive Technology II", "regular", 12, False),
                  ("Welding Fundamentals", "dual_enrollment", 12, False), ("Algebra II", "regular", 11, False),
                  ("English 12", "regular", 12, False)],
         scores=[("act", 21, None, "2026-04-18", {"english": 20, "math": 22, "reading": 21, "science": 21})],
         colleges=[(13, T, "student"), (14, L, "suggested"), (15, L, "student")],
         quest=Q("Earn the entry-level brakes certification",
                 "Work through the study guide and book the test.",
                 "competition_prep", "paused",
                 [("Finish the study guide chapters", 6), ("Take two practice tests", 3), ("Book and sit the exam", 2)],
                 done=1, extra=0, last=19, streak=0, best=6),
         essays=[E("personal_statement", "idea", 0, prompt=None, days=25)]),

    dict(first="Amara", last="Okonkwo", grade=12, gpa=(3.55, 3.8), majors=["Studio Art", "Art Education"],
         share=ALL,
         activities=[
             A("Art", "Art club", "President", "Riverbend High School",
               "Plan the spring show and run open studio on Thursdays.", [10, 11, 12], "school_year", 4, 32),
             A("Art", "Underpass mural project", "Lead painter", "Riverbend Arts Council",
               "Designed and painted a 40-foot mural with six other students.", [11], "summer", 20, 6),
             A("Community Service (Volunteer)", "Museum teen council", "Member", "Riverbend Art Museum",
               "Help plan teen nights and give gallery talks.", [11, 12], "school_year", 2, 28),
             A("Family Responsibilities", "Looking after younger siblings", None, None,
               "Pick up two younger brothers and make dinner on weekdays.", [9, 10, 11, 12], "all_year", 10, 50),
         ],
         awards=[("Regional student art awards, gold key in painting", "regional", 11, "")],
         courses=[("AP Art and Design", "ap", 12, False), ("Drawing and Painting III", "honors", 11, False),
                  ("AP English Language", "ap", 11, False), ("Art History", "regular", 12, False),
                  ("Statistics", "regular", 12, False)],
         scores=[("sat", 1280, None, "2026-06-06", {"reading_writing": 670, "math": 610})],
         colleges=[(2, R, "suggested"), (4, R, "suggested"), (5, T, "suggested"), (10, T, "student"),
                   (11, T, "suggested"), (13, L, "suggested")],
         quest=Q("Build a 12-piece portfolio",
                 "Finish, photograph and sequence twelve pieces for art school applications.",
                 "passion_project", "active",
                 [("Choose the pieces to finish", 2), ("Finish four paintings", 8), ("Finish the drawings", 6),
                  ("Photograph everything", 3), ("Sequence and write the statements", 4)],
                 done=2, extra=3, last=0, streak=5, best=8),
         essays=[E("personal_statement", "revising", 540, prompt="6", days=2),
                 E("supplement", "drafting", 110, 250, college=2, days=4)]),

    dict(first="Jun", last="Takeda", grade=12, gpa=(3.84, 4.3), majors=["Mathematics", "Music"],
         share=("essays",),
         activities=[
             A("Music: Instrumental", "Youth symphony", "Principal cello", "Riverbend Youth Symphony",
               "Section leader for two seasons.", [9, 10, 11, 12], "school_year", 6, 36),
             A("Science/Math", "Math team", "Member", "Riverbend High School",
               None, [10, 11, 12], "school_year", 2, 28),
             A("Work (Paid)", "Cello lessons for beginners", "Teacher", None,
               "Teach four elementary students weekly.", [11, 12], "all_year", 3, 44),
         ],
         awards=[("All-State Orchestra", "state", 11, ""), ("School winner, national math contest", "school", 11, "")],
         courses=[("AP Calculus BC", "ap", 11, False), ("AP Music Theory", "ap", 11, False),
                  ("Multivariable Calculus", "dual_enrollment", 12, False), ("AP Physics 1", "ap", 12, False)],
         scores=[("act", 33, None, "2026-04-18", {"english": 32, "math": 35, "reading": 32, "science": 33}),
                 ("ap", 5, "Calculus BC", "2026-05-12", None), ("ap", 5, "Music Theory", "2026-05-15", None)],
         colleges=[(0, R, "suggested"), (2, R, "suggested"), (3, R, "suggested"), (5, T, "suggested"),
                   (6, T, "suggested"), (7, T, "suggested"), (12, L, "suggested")],
         quest=None,
         essays=[E("personal_statement", "drafting", 210, prompt="6", days=5),
                 E("supplement", "idea", 0, 250, college=0, days=14)]),

    dict(first="Leila", last="Haddad", grade=12, gpa=(3.66, 4.05), majors=["Journalism", "English"],
         share=(),
         activities=[
             A("Journalism/Publication", "School newspaper", "Editor in chief", "The Riverbend Current",
               "Edit a staff of 18 and publish every three weeks.", [9, 10, 11, 12], "school_year", 7, 34),
             A("Journalism/Publication", "Literary magazine", "Fiction editor", "Riverbend High School",
               None, [11, 12], "school_year", 2, 24),
             A("Work (Paid)", "Public library", "Page", "Riverbend Public Library",
               "Shelve and run the summer reading desk.", [11, 12], "all_year", 8, 46),
         ],
         awards=[("State scholastic press awards, first place in news writing", "state", 11, "")],
         courses=[("AP English Language", "ap", 11, False), ("AP English Literature", "ap", 12, False),
                  ("AP US History", "ap", 11, False), ("Journalism III", "honors", 12, False)],
         scores=[("sat", 1390, None, "2026-08-22", {"reading_writing": 740, "math": 650})],
         colleges=[(3, R, "suggested"), (5, T, "suggested"), (8, T, "suggested"), (12, L, "suggested"),
                   (13, L, "suggested")],
         quest=Q("Report a three-part series on the bus route cuts",
                 "Interview riders, drivers and the transit board, and publish in three issues.",
                 "passion_project", "active",
                 [("Get the route data and the board minutes", 3), ("Interview eight riders", 5),
                  ("Write part one", 3), ("Write parts two and three", 6)],
                 done=1, extra=2, last=0, streak=3, best=7),
         essays=[E("personal_statement", "done", 601, prompt="2", days=4),
                 E("supplement", "done", 245, 250, college=3, days=6),
                 E("supplement", "done", 298, 300, college=5, days=6)]),

    # ── Grade 11 ──
    dict(first="Caleb", last="Whitlock", grade=11, gpa=(3.2, 3.4), majors=["Business"],
         share=ALL,
         activities=[
             A("Athletics: JV/Varsity", "Football", "Varsity linebacker", "Riverbend High School",
               None, [9, 10, 11], "school_year", 14, 16),
             A("Athletics: JV/Varsity", "Track and field", "Thrower", "Riverbend High School",
               None, [10, 11], "school_year", 8, 12),
             A("Work (Paid)", "Lawn care business", "Owner", None,
               "Mow and edge for 11 regular customers. Bought a second mower with the first summer's earnings.",
               [10, 11], "summer", 18, 12),
             A("Career Oriented", "DECA", "Member", "Riverbend High School", None, [11], "school_year", 2, 24),
         ],
         awards=[("All-conference honorable mention, football", "regional", 11, "")],
         courses=[("Honors English 11", "honors", 11, False), ("Algebra II", "regular", 11, False),
                  ("Intro to Business", "regular", 10, False), ("AP US History", "ap", 11, False)],
         scores=[("psat", 1090, None, "2025-10-15", {"reading_writing": 560, "math": 530})],
         colleges=[(6, R, "rough"), (9, T, "rough"), (12, L, "rough"), (14, L, "student")],
         quest=Q("Write a business plan for my lawn care company",
                 "Price the services properly, plan a second crew, and write it up for the DECA spring event.",
                 "competition_prep", "active",
                 [("Work out what each job really costs", 3), ("Survey my customers", 3),
                  ("Draft the plan", 5), ("Practice the pitch", 3)],
                 done=1, extra=1, last=1, streak=2, best=4),
         essays=[]),

    dict(first="Noor", last="Farouk", grade=11, gpa=(3.9, 4.35), majors=["Environmental Science"],
         share=ALL,
         activities=[
             A("Environmental", "Creek Keepers club", "Founder", "Riverbend High School",
               "Started a club of 22 that samples Mill Creek monthly.", [10, 11], "school_year", 4, 32),
             A("Research", "Water quality research", "Student researcher", "Riverbend State University",
               "Run nitrate and turbidity tests for a graduate student's creek study.", [11], "all_year", 5, 30),
             A("Community Service (Volunteer)", "Scout troop", "Senior scout", None,
               "Led a river clean-up that pulled out 600 pounds of trash.", [9, 10, 11], "all_year", 2, 40),
         ],
         awards=[("Regional science fair, first place in earth science", "regional", 10, "")],
         courses=[("AP Environmental Science", "ap", 10, False), ("AP Chemistry", "ap", 11, False),
                  ("AP English Language", "ap", 11, False), ("Honors Precalculus", "honors", 11, False),
                  ("AP Biology", "ap", 12, True), ("AP Statistics", "ap", 12, True)],
         scores=[("psat", 1380, None, "2025-10-15", {"reading_writing": 700, "math": 680}),
                 ("ap", 5, "Environmental Science", "2026-05-06", None)],
         colleges=[(2, R, "rough"), (4, R, "rough"), (6, T, "rough"), (8, T, "student"), (12, L, "rough")],
         quest=Q("Test six creek sites and present the findings to the city council",
                 "Sample six sites for eight weeks, chart the results, and ask for three minutes at a council meeting.",
                 "research", "active",
                 [("Pick the six sites and get permission", 3), ("Sample for eight weeks", 16),
                  ("Chart and write up the results", 5), ("Present to the council", 2)],
                 done=1, extra=14, last=0, streak=17, best=17),
         essays=[E("personal_statement", "idea", 0, prompt=None, days=3)]),

    dict(first="Mateo", last="Salazar", grade=11, gpa=(3.1, None), majors=["Culinary Arts", "Hospitality Management"],
         share=("portfolio", "quest"),
         activities=[
             A("Work (Paid)", "Line cook", "Grill station", "Casa Lucero",
               "Work dinner service four nights a week.", [10, 11], "all_year", 18, 50),
             A("Career Oriented", "Culinary club", "Vice president", "Riverbend High School",
               "Cater two school events a semester.", [10, 11], "school_year", 3, 28),
             A("Family Responsibilities", "Caring for my grandmother", None, None,
               "Cook and keep her company on the days my mother works doubles.", [9, 10, 11], "all_year", 8, 50),
         ],
         awards=[],
         courses=[("Culinary Arts I", "regular", 10, False), ("Culinary Arts II", "regular", 11, False),
                  ("Spanish for Heritage Speakers", "honors", 11, False), ("Geometry", "regular", 10, False),
                  ("English 11", "regular", 11, False)],
         scores=[],
         colleges=[(14, L, "student"), (15, L, "student")],
         quest=Q("Cost and test a five-dish menu",
                 "Develop five dishes, cost each plate, and cook the menu for twelve people.",
                 "passion_project", "paused",
                 [("Pick the five dishes", 2), ("Test and adjust each one", 8), ("Cost every plate", 3),
                  ("Cook the dinner", 2)],
                 done=1, extra=3, last=16, streak=0, best=5),
         essays=[]),

    dict(first="Imani", last="Brooks", grade=11, gpa=(3.6, 3.9), majors=["Theater", "Communications"],
         share=("college_list", "essays"),
         activities=[
             A("Theater/Drama", "Drama program", "Lead roles in four productions", "Riverbend High School",
               None, [9, 10, 11], "school_year", 10, 30),
             A("Dance", "Dance company", "Company member", "Riverbend Dance Collective",
               "Modern and jazz. Perform in two concerts a year.", [9, 10, 11], "all_year", 6, 44),
             A("Music: Vocal", "Church choir", "Soprano section", None, None, [9, 10, 11], "all_year", 2, 46),
         ],
         awards=[("State thespian festival, superior rating in solo acting", "state", 10, "")],
         courses=[("Theater Arts III", "honors", 11, False), ("AP English Language", "ap", 11, False),
                  ("Honors US History", "honors", 11, False), ("Algebra II", "regular", 11, False)],
         scores=[("psat", 1180, None, "2025-10-15", {"reading_writing": 640, "math": 540})],
         colleges=[],
         quest=Q("Direct a one-act for the winter showcase",
                 "Choose a script, cast it, and run rehearsals through to the performance.",
                 "passion_project", "completed",
                 [("Choose the script and get the rights", 2), ("Cast and block it", 4), ("Rehearse", 8),
                  ("Tech week and the show", 3)],
                 done=4, last=21, streak=0, best=10),
         essays=[E("personal_statement", "idea", 35, prompt=None, days=30)]),

    dict(first="Wren", last="Castellanos", grade=11, gpa=(None, None), majors=[],
         share=ALL,
         activities=[
             A("Work (Paid)", "Grocery store", "Cashier", "Harlow's Market", None, [11], "all_year", 14, 40),
         ],
         awards=[],
         courses=[("English 11", "regular", 11, False), ("Algebra II", "regular", 11, False)],
         scores=[],
         colleges=[],
         quest=None,
         essays=[]),

    dict(first="Dmitri", last="Volkov", grade=11, gpa=(4.0, 4.6), majors=["Physics", "Mathematics"],
         share=("college_list", "portfolio", "quest"),
         activities=[
             A("Science/Math", "Math team", "Captain", "Riverbend High School",
               "Write practice sets and run Tuesday sessions.", [9, 10, 11], "school_year", 4, 32),
             A("Science/Math", "Physics olympiad study group", "Organizer", None,
               "Meet weekly with three students from two other schools.", [10, 11], "school_year", 4, 28),
             A("Academic", "Chess club", "Board one", "Riverbend High School", None, [9, 10, 11], "school_year", 2, 30),
             A("Community Service (Volunteer)", "Math tutoring", "Volunteer tutor", "Riverbend Middle School",
               None, [10, 11], "school_year", 2, 26),
         ],
         awards=[("State math league, third place individual", "state", 10, ""), ("AP Scholar", "national", 10, "")],
         courses=[("AP Calculus BC", "ap", 10, False), ("AP Physics C: Mechanics", "ap", 11, False),
                  ("Linear Algebra", "dual_enrollment", 11, False), ("AP Chemistry", "ap", 11, False),
                  ("AP Physics C: Electricity and Magnetism", "ap", 12, True)],
         scores=[("sat", 1560, None, "2026-08-22", {"reading_writing": 760, "math": 800}),
                 ("ap", 5, "Calculus BC", "2026-05-12", None)],
         colleges=[(0, R, "suggested"), (1, R, "suggested"), (2, R, "suggested"), (3, R, "suggested"),
                   (4, R, "student"), (7, R, "student")],
         quest=Q("Work through a first course in real analysis",
                 "One chapter a week with written proofs, checked against the solutions.",
                 "other", "active",
                 [("Sets and sequences", 5), ("Limits and continuity", 6), ("Differentiation", 5), ("Integration", 6)],
                 done=1, extra=2, last=8, streak=0, best=6),
         essays=[E("personal_statement", "drafting", 150, prompt="6", days=15)]),

    dict(first="Hana", last="Kobayashi", grade=11, gpa=(3.45, None), majors=["Film"],
         share=(),
         activities=[
             A("Art", "Film club", "Co-founder", "Riverbend High School",
               "Screen and make short films. Ran the first student film night.", [10, 11], "school_year", 3, 30),
             A("Work (Paid)", "Event videography", "Second camera", None,
               "Shoot weddings and quinceaneras with a local videographer.", [11], "all_year", 6, 30),
             A("Journalism/Publication", "Yearbook", "Photo editor", "Riverbend High School",
               None, [10, 11], "school_year", 3, 32),
         ],
         awards=[("Regional student film festival, jury prize for documentary short", "regional", 10, "")],
         courses=[("Digital Media II", "regular", 11, False), ("Honors English 11", "honors", 11, False),
                  ("Photography", "regular", 10, False)],
         scores=[],
         colleges=[(4, R, "rough"), (8, T, "rough"), (10, T, "student")],
         quest=Q("Make a ten-minute documentary about my grandfather's shop",
                 "Film over six weekends and cut it in time for the spring festival.",
                 "passion_project", "active",
                 [("Plan the shots and the interviews", 3), ("Film at the shop", 6), ("Rough cut", 6),
                  ("Sound, color and the final cut", 5)],
                 done=1, extra=4, last=0, streak=6, best=6),
         essays=[]),

    # ── Grade 10 ──
    dict(first="Elias", last="Thornbury", grade=10, gpa=(3.7, None), majors=["History"],
         share=ALL,
         activities=[
             A("Academic", "Quiz bowl", "Varsity team", "Riverbend High School", None, [9, 10], "school_year", 3, 30),
             A("Academic", "History Day project", "Researcher", None,
               "Built an exhibit on the 1913 Riverbend flood from county archives.", [9, 10], "school_year", 4, 20),
             A("Community Service (Volunteer)", "Scout troop", "Patrol leader", None, None, [9, 10], "all_year", 2, 40),
         ],
         awards=[("History Day regional contest, second place exhibit", "regional", 9, "")],
         courses=[("AP World History", "ap", 10, False), ("Honors English 10", "honors", 10, False),
                  ("Geometry", "regular", 10, False), ("Latin II", "regular", 10, False)],
         scores=[("psat", 1150, None, "2026-10-07", {"reading_writing": 620, "math": 530})],
         colleges=[(5, R, "rough"), (8, T, "rough")],
         quest=Q("Research and build this year's History Day exhibit",
                 "Find a local topic, work from primary sources, and build the board by the regional deadline.",
                 "competition_prep", "active",
                 [("Choose the topic", 2), ("Archive visits and notes", 6), ("Write the exhibit text", 5),
                  ("Build the board", 4)],
                 done=1, extra=2, last=0, streak=4, best=5),
         essays=[]),

    dict(first="Sofia", last="Marchetti", grade=10, gpa=(3.85, 4.1), majors=["Linguistics", "Education"],
         share=("quest",),
         activities=[
             A("Foreign Language", "Italian club", "Secretary", "Riverbend High School", None, [9, 10], "school_year", 1, 28),
             A("Community Service (Volunteer)", "English conversation tutoring", "Volunteer",
               "Riverbend Public Library", "Tutor adult learners on Saturday mornings.", [10], "school_year", 2, 30),
             A("Athletics: JV/Varsity", "Soccer", "JV midfielder", "Riverbend High School", None, [9, 10], "school_year", 8, 12),
         ],
         awards=[("National Italian exam, silver medal", "national", 9, "")],
         courses=[("Italian III Honors", "honors", 10, False), ("Spanish I", "regular", 10, False),
                  ("Honors English 10", "honors", 10, False), ("Honors Chemistry", "honors", 10, False)],
         scores=[],
         colleges=[],
         quest=Q("Reach conversational Spanish to tutor newcomers",
                 "Thirty minutes a day, a weekly conversation partner, and a first tutoring session by spring.",
                 "other", "active",
                 [("Set up the daily routine", 2), ("The first 500 words", 10), ("Weekly conversations", 12),
                  ("Sit in on a tutoring session", 2)],
                 done=1, extra=7, last=0, streak=9, best=9, minutes=30),
         essays=[]),

    dict(first="Kwame", last="Mensah", grade=10, gpa=(3.3, None), majors=["Computer Science"],
         share=("portfolio",),
         activities=[
             A("Computer/Technology", "Coding club", "Member", "Riverbend High School",
               "Made a platformer for the winter game jam.", [9, 10], "school_year", 2, 30),
             A("Athletics: JV/Varsity", "Basketball", "JV guard", "Riverbend High School", None, [9, 10], "school_year", 9, 16),
         ],
         awards=[],
         courses=[("Intro to Computer Science", "regular", 9, False), ("AP Computer Science Principles", "ap", 10, False),
                  ("Geometry", "regular", 10, False), ("English 10", "regular", 10, False)],
         scores=[],
         colleges=[],
         quest=Q("Finish and publish my platformer",
                 "Three more levels, a title screen, and a public page for it.",
                 "passion_project", "active",
                 [("Fix the jump physics", 3), ("Build three levels", 8), ("Title screen and sound", 4),
                  ("Publish it", 2)],
                 done=0, extra=2, last=14, streak=0, best=2),
         essays=[]),

    dict(first="Juniper", last="Hale", grade=10, gpa=(3.5, None), majors=["Animal Science", "Agricultural Business"],
         share=ALL,
         activities=[
             A("Career Oriented", "FFA", "Chapter reporter", "Riverbend High School",
               "Write the chapter newsletter and compete in livestock judging.", [9, 10], "school_year", 4, 34),
             A("Other", "Raising dairy goats", "Herd of nine", None,
               "Feed, milk and keep health records morning and evening.", [9, 10], "all_year", 12, 52),
             A("Community Service (Volunteer)", "4-H", "Club treasurer", None, None, [9, 10], "all_year", 2, 40),
         ],
         awards=[("County fair, grand champion dairy goat", "regional", 9, "")],
         courses=[("Agricultural Science II", "regular", 10, False), ("Honors Biology", "honors", 10, False),
                  ("Geometry", "regular", 10, False), ("English 10", "regular", 10, False)],
         scores=[],
         colleges=[(12, T, "rough"), (14, L, "rough")],
         quest=Q("Keep a breeding record for my herd through kidding season",
                 "Track every doe, plan the pairings, and write up the season for my FFA record book.",
                 "other", "active",
                 [("Set up the record sheets", 2), ("Plan the pairings", 3), ("Daily records through kidding", 14),
                  ("Write the season summary", 3)],
                 done=2, extra=2, last=0, streak=7, best=7),
         essays=[]),

    dict(first="Arjun", last="Mehta", grade=10, gpa=(3.75, 4.0), majors=["Finance", "Economics"],
         share=("college_list", "portfolio"),
         activities=[
             A("Career Oriented", "DECA", "Member", "Riverbend High School",
               "Compete in the principles of finance event.", [9, 10], "school_year", 3, 28),
             A("Athletics: Club", "Cricket club", "Opening batter", "Riverbend Cricket Club", None, [9, 10], "summer", 6, 14),
             A("Academic", "Investment club", "Co-founder", "Riverbend High School",
               "Run a paper portfolio and a weekly market recap.", [10], "school_year", 1, 28),
         ],
         awards=[("DECA district conference, first place in principles of finance", "regional", 9, "")],
         courses=[("Honors Algebra II", "honors", 10, False), ("AP Human Geography", "ap", 9, False),
                  ("Honors English 10", "honors", 10, False), ("Intro to Business", "regular", 10, False)],
         scores=[("ap", 4, "Human Geography", "2026-05-05", None)],
         colleges=[(0, R, "rough"), (3, R, "rough"), (6, T, "rough")],
         quest=None,
         essays=[]),

    dict(first="Talia", last="Rosen", grade=10, gpa=(3.0, None), majors=[],
         share=(),
         activities=[
             A("Music: Instrumental", "Marching band", "Clarinet", "Riverbend High School", None, [9, 10], "school_year", 8, 16),
         ],
         awards=[],
         courses=[("English 10", "regular", 10, False), ("Geometry", "regular", 10, False),
                  ("Biology", "regular", 10, False)],
         scores=[],
         colleges=[],
         quest=Q("Audition for the regional honor band",
                 "Learn the audition piece and record a practice take every week.",
                 "competition_prep", "draft",
                 [("Learn the scales", 4), ("Learn the audition piece", 8), ("Record and review", 4)]),
         essays=[]),

    # ── Grade 9 ──
    dict(first="Micah", last="Delacroix", grade=9, gpa=(None, None), majors=["Engineering"],
         share=ALL,
         activities=[
             A("Robotics", "Robotics team", "New member", "Riverbend High School",
               "Learning to wire and program the practice robot.", [9], "school_year", 5, 28),
         ],
         awards=[],
         courses=[("Algebra I", "regular", 9, False), ("Honors Biology", "honors", 9, False),
                  ("English 9", "regular", 9, False), ("Intro to Engineering", "regular", 9, False)],
         scores=[],
         colleges=[],
         quest=Q("Learn enough Python to program the practice robot",
                 "Work through a beginner course and write one routine the robot actually runs.",
                 "other", "active",
                 [("Variables, loops and functions", 6), ("Read the team's code", 3), ("Write a drive routine", 5)],
                 done=0, extra=3, last=0, streak=3, best=3, minutes=15),
         essays=[]),

    dict(first="Zoe", last="Nakamura", grade=9, gpa=(3.9, None), majors=[],
         share=("quest", "essays"),
         activities=[
             A("Athletics: Club", "Club swimming", "Distance freestyle", "Riverbend Aquatics",
               "Six practices a week. Qualified for the state age-group meet.", [9], "all_year", 12, 46),
             A("Art", "Art club", "Member", "Riverbend High School", None, [9], "school_year", 1, 28),
         ],
         awards=[],
         courses=[("Honors Geometry", "honors", 9, False), ("Honors English 9", "honors", 9, False),
                  ("Biology", "regular", 9, False), ("Japanese I", "regular", 9, False)],
         scores=[],
         colleges=[],
         quest=Q("Drop ten seconds from my 500 free",
                 "Follow the coach's plan, log every set, and review the splits each week.",
                 "competition_prep", "active",
                 [("Baseline and goals", 2), ("Aerobic block", 12), ("Race pace block", 10), ("Taper and race", 4)],
                 done=1, extra=11, last=0, streak=13, best=13, minutes=15),
         essays=[]),

    dict(first="Omar", last="Siddiqui", grade=9, gpa=(None, None), majors=[],
         share=(),
         activities=[],
         awards=[],
         courses=[("Algebra I", "regular", 9, False), ("Honors Biology", "honors", 9, False)],
         scores=[],
         colleges=[],
         quest=None,
         essays=[]),

    dict(first="Ruby", last="Callahan", grade=9, gpa=(3.6, None), majors=["Social Work"],
         share=("portfolio", "quest", "essays"),
         activities=[
             A("Community Service (Volunteer)", "Food pantry", "Saturday volunteer", "Riverbend Community Pantry",
               "Sort donations and pack boxes for about 60 families a week.", [9], "all_year", 3, 44),
             A("Music: Vocal", "Concert choir", "Alto", "Riverbend High School", None, [9], "school_year", 3, 32),
         ],
         awards=[],
         courses=[("English 9", "regular", 9, False), ("Algebra I", "regular", 9, False),
                  ("World Geography", "regular", 9, False), ("Spanish I", "regular", 9, False)],
         scores=[],
         colleges=[],
         quest=None,
         essays=[]),

    dict(first="Felix", last="Aguirre", grade=9, gpa=(None, None), majors=[],
         share=(),
         activities=[
             A("Athletics: JV/Varsity", "Soccer", "Freshman team", "Riverbend High School", None, [9], "school_year", 8, 12),
         ],
         awards=[],
         courses=[("English 9", "regular", 9, False), ("Algebra I", "regular", 9, False)],
         scores=[],
         colleges=[],
         quest=Q("Make the JV soccer team next fall",
                 "Touches and conditioning four days a week through the winter.",
                 "other", "active",
                 [("Fitness baseline", 2), ("Winter training block", 12), ("Spring tryout prep", 6)],
                 done=0, extra=1, last=12, streak=0, best=1, minutes=15),
         essays=[]),
]

# ── Six meeting requests ──────────────────────────────────────────────────────
# times: (days after next week's Monday, hour, minute) in UTC, which lands in the
# school day across the US. "ago" is how long ago the student asked, in hours.
REQUESTS = [
    dict(who="Marisol Quintero", status="pending", ago=5,
         message="Could we go over my supplement list? I am not sure which of the three I should finish first, "
                 "and one deadline is close.",
         times=[(0, 18, 30), (1, 19, 0), (3, 18, 0)]),
    dict(who="Noor Farouk", status="pending", ago=26,
         message="I would like to ask about summer research programs and whether my list has enough target schools.",
         times=[(1, 18, 0), (2, 18, 30)]),
    dict(who="Wren Castellanos", status="pending", ago=49,
         message="I do not really know where to start with any of this. Can we talk?",
         times=[(0, 19, 30)]),
    dict(who="Hana Kobayashi", status="pending", ago=2,
         message="Can we talk about film programs and what a portfolio needs? Any lunch period works for me.",
         times=[(2, 17, 0), (3, 17, 0), (4, 17, 0)]),
    dict(who="Priya Raman", status="confirmed", ago=72,
         message="I would like a second pair of eyes on my early application plan before I submit.",
         times=[(1, 18, 30), (2, 19, 0)], meeting=(1, 18, 30),
         note="Tuesday works. Bring your activity list."),
    dict(who="Caleb Whitlock", status="declined", ago=150, answered_ago=96,
         message="Can we meet about which classes I should take senior year?",
         times=[(-6, 18, 0)],
         note="I am out that day. Please send two or three other times and I will pick one."),
]


# ── Writing SQL ───────────────────────────────────────────────────────────────

class Raw(str):
    """A SQL expression, written out as it is."""


def lit(value):
    """One value as a SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, Raw):
        return str(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    text = str(value)
    if "\x00" in text:
        raise ValueError("a NUL character cannot go in SQL text")
    return "'" + text.replace("'", "''") + "'"


def jsonb(value):
    return Raw(lit(json.dumps(value)) + "::jsonb")


def int_array(values):
    return Raw("'{" + ",".join(str(int(v)) for v in values) + "}'::int[]")


def ago(days=0, hours=0):
    return Raw(f"now() - interval '{int(days)} days {int(hours)} hours'")


def day_ago(days):
    return Raw(f"current_date - {int(days)}")


def next_week(day, hour, minute):
    """A time in the week after this one: `day` days after its Monday (UTC)."""
    return Raw(f"date_trunc('week', now()) + interval '{7 + int(day)} days {int(hour)} hours {int(minute)} minutes'")


def insert(table, columns, rows, conflict="DO NOTHING"):
    if not rows:
        return ""
    lines = ",\n".join("  (" + ", ".join(lit(v) for v in row) + ")" for row in rows)
    return f"INSERT INTO {table}\n  ({', '.join(columns)})\nVALUES\n{lines}\nON CONFLICT {conflict};\n"


def email_of(student):
    return f"{student['first']}.{student['last']}@{DOMAIN}".lower()


def course_year(student, grade):
    """The fall a course from `grade` starts in, for this student (next fall for a planned one)."""
    return 2026 + (grade - student["grade"])


def award_year(student, grade):
    """The year an award from `grade` was given: that spring, or this fall for the current grade."""
    return 2026 if grade >= student["grade"] else 2027 - (student["grade"] - grade)


def build(counselor_email=None, transaction=True):
    out = []
    emit = out.append

    students = []
    for s in STUDENTS:
        s = dict(s)
        s["email"] = email_of(s)
        s["id"] = uid("student", s["email"])
        s["name"] = f"{s['first']} {s['last']}"
        students.append(s)
    by_name = {s["name"]: s for s in students}
    ids = ", ".join(lit(s["id"]) for s in students)

    emit("-- The counselor demo school. Written by supabase/seed/seed_counselor_demo.py: change\n"
         "-- that script and print this again, do not edit it by hand. Every person, college\n"
         "-- and detail below is made up. Remove it all with supabase/seed/clear_counselor_demo.sql\n")
    if transaction:
        emit("BEGIN;\n")

    emit("DO $$\nBEGIN\n"
         "  IF to_regclass('public.school_links') IS NULL THEN\n"
         "    RAISE EXCEPTION 'Apply supabase/migrations/20261012_counselor.sql first.';\n"
         "  END IF;\nEND;\n$$;\n")

    emit("-- Earlier demo students go first, and everything of theirs with the account.\n"
         f"DELETE FROM auth.users\n WHERE id IN ({ids})\n   AND email LIKE '%@{DOMAIN}';\n")

    emit("-- The school. Its join code is drawn once and kept when this runs again.\n"
         "INSERT INTO public.schools (id, name, join_code, is_demo)\n"
         f"VALUES ({lit(SCHOOL_ID)}, {lit(SCHOOL_NAME)}, public.counselor_new_join_code(), true)\n"
         "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;\n")

    # Accounts nobody can sign in to: no password, no confirmed email, an address
    # that cannot receive mail, and a ban. The empty strings are what the auth
    # server expects in place of NULL in its token columns.
    emit("-- Accounts with no way in: no password, an address that cannot get mail, banned until 2100.")
    emit(insert(
        "auth.users",
        ["id", "instance_id", "aud", "role", "email", "encrypted_password", "banned_until", "raw_app_meta_data",
         "raw_user_meta_data", "created_at", "updated_at", "confirmation_token", "recovery_token",
         "email_change_token_new", "email_change"],
        [(s["id"], "00000000-0000-0000-0000-000000000000", "authenticated", "authenticated", s["email"], "",
          Raw("TIMESTAMPTZ '2100-01-01 00:00:00+00'"), jsonb({"provider": "email", "providers": ["email"], "demo": True}),
          jsonb({"demo": True}), ago(40 + i), ago(40 + i), "", "", "", "")
         for i, s in enumerate(students)],
        conflict="(id) DO NOTHING"))

    # The sign-up trigger has already made each profile row; this fills it in.
    emit(insert(
        "public.profiles",
        ["id", "full_name", "grade_level", "graduation_year", "gpa_unweighted", "gpa_weighted", "gpa_scale",
         "candidate_majors", "school_type", "onboarding_completed", "is_demo"],
        [(s["id"], s["name"], s["grade"], CLASS_OF[s["grade"]], s["gpa"][0], s["gpa"][1],
          "4.0" if s["gpa"][0] is not None else None, jsonb(s["majors"]), "public", True, True)
         for s in students],
        conflict="(id) DO UPDATE SET full_name = EXCLUDED.full_name, grade_level = EXCLUDED.grade_level,\n"
                 "  graduation_year = EXCLUDED.graduation_year, gpa_unweighted = EXCLUDED.gpa_unweighted,\n"
                 "  gpa_weighted = EXCLUDED.gpa_weighted, gpa_scale = EXCLUDED.gpa_scale,\n"
                 "  candidate_majors = EXCLUDED.candidate_majors, school_type = EXCLUDED.school_type,\n"
                 "  onboarding_completed = true, is_demo = true"))

    activities, awards, courses, scores, colleges = [], [], [], [], []
    quests, milestones, tasks, checkins, stats, essays, links = [], [], [], [], [], [], []
    for n, s in enumerate(students):
        sid = s["id"]
        for i, a in enumerate(s["activities"]):
            activities.append((uid(sid, "activity", i), sid, a["category"], a["title"], a["position"],
                               a["organization"], a["description"], int_array(a["grades"]), a["timing"],
                               a["hours"], a["weeks"], "enriched" if a["description"] else "name_only", i))
        for i, (title, level, grade, description) in enumerate(s["awards"]):
            awards.append((uid(sid, "award", i), sid, title, level, grade, award_year(s, grade),
                           description or None, i))
        for i, (name, level, grade, planned) in enumerate(s["courses"]):
            courses.append((uid(sid, "course", i), sid, name, level, grade, course_year(s, grade), planned, i))
        for i, (test, score, subject, date, sections) in enumerate(s["scores"]):
            scores.append((uid(sid, "score", i), sid, test, score, jsonb(sections or {}), subject,
                           Raw(f"DATE {lit(date)}")))
        for i, (index, category, source) in enumerate(s["colleges"]):
            name, city, state, admit, price, sat25, sat75, act25, act75, enrollment = COLLEGES[index]
            colleges.append((uid(sid, "college", index), sid, 99000001 + index, name, city, state, admit, sat25,
                             sat75, act25, act75, price, enrollment, category, source, ago(30 - i)))

        quest = s["quest"]
        if quest:
            qid = uid(sid, "quest")
            status = quest["status"]
            done_ms = quest["done"]
            ms = quest["milestones"]
            n_tasks = sum(days for _, days in ms[:done_ms]) + quest["extra"]
            last = quest["last"] if quest["last"] is not None else 0
            started = last + n_tasks + 3
            live = status != "draft"
            quests.append((
                qid, sid, quest["title"], quest["summary"], quest["kind"], status, quest["minutes"],
                int_array([0, 6]),
                Raw("jsonb_build_array(jsonb_build_object('slot', 1, 'date', "
                    f"to_char(current_date - {started}, 'YYYY-MM-DD'), 'rest', '[0, 6]'::jsonb))") if live
                else jsonb([]),
                day_ago(started) if live else None,
                day_ago(last) if status == "paused" else None,
                day_ago(last) if status == "completed" else None,
                ago(started + 1), ago(last) if live else ago(2),
                ago(started) if live else None,
                ago(last, 2) if status == "completed" else None))

            # Tasks and check-ins, oldest first: every day of each finished
            # milestone, then the days done in the one under way.
            slot = 0
            for position, (title, days) in enumerate(ms, start=1):
                mid = uid(qid, "milestone", position)
                finished = position <= done_ms
                done_here = days if finished else (quest["extra"] if position == done_ms + 1 else 0)
                first_slot = slot + 1
                for _ in range(done_here):
                    slot += 1
                    age = last + (n_tasks - slot)          # days ago: the newest task is `last` days old
                    tid = uid(qid, "task", slot)
                    tasks.append((tid, sid, qid, mid, slot, f"Demo task {slot}", "", quest["minutes"] // 2 or 15,
                                  "done", day_ago(age)))
                    checkins.append((uid(qid, "checkin", slot), sid, qid, tid, CHECKIN_TEXT, "Demo reply.",
                                     True, 10, ago(age, 2)))
                finished_age = last + (n_tasks - slot) if finished and slot >= first_slot else None
                milestones.append((mid, sid, qid, position, title, "", days, "done" if finished else "pending",
                                   ago(finished_age, 2) if finished_age is not None else None))

            if live:
                xp = 10 * n_tasks + 40 * done_ms + (100 if status == "completed" else 0)
                stats.append((sid, xp, quest["streak"], day_ago(last) if n_tasks else None,
                              max(quest["best"], quest["streak"])))

        for i, e in enumerate(s["essays"]):
            personal = e["kind"] == "personal_statement"
            college = COLLEGES[e["college"]][0] if e["college"] is not None else ""
            essays.append((
                uid(sid, "essay", i), sid, e["kind"],
                "Personal statement (demo)" if personal else f"{college} supplement (demo)",
                e["prompt"], PROMPT_TEXT if (e["prompt"] or not personal) else "", college, e["limit"],
                ESSAY_TEXT if e["words"] else "", e["words"], e["status"], ago(e["days"] + 20), ago(e["days"], 3)))

        share = set(s["share"])
        links.append((sid, SCHOOL_ID, "college_list" in share, "portfolio" in share, "quest" in share,
                      "essays" in share, ago(34 - n)))

    emit(insert("public.student_activities",
                ["id", "user_id", "category", "title", '"position"', "organization", "description", "grade_levels",
                 "timing", "hours_per_week", "weeks_per_year", "detail_level", "order_index"], activities))
    emit(insert("public.student_awards",
                ["id", "user_id", "title", "level", "grade_level", "year", "description", "order_index"], awards))
    emit(insert("public.student_courses",
                ["id", "user_id", "name", "level", "grade_level", "year", "planned", "order_index"], courses))
    emit(insert("public.student_test_scores",
                ["id", "user_id", "test_type", "score", "section_scores", "subject", "test_date"], scores))
    emit(insert("public.college_list_items",
                ["id", "user_id", "scorecard_id", "name", "city", "state", "admission_rate", "sat_25", "sat_75",
                 "act_25", "act_75", "net_price", "enrollment", "category", "category_source", "created_at"],
                colleges))
    emit(insert("public.quests",
                ["id", "user_id", "title", "summary", "goal_kind", "status", "daily_minutes", "rest_days", "schedule",
                 "start_date", "paused_on", "ended_on", "created_at", "updated_at", "started_at", "completed_at"],
                quests))
    emit(insert("public.quest_milestones",
                ["id", "user_id", "quest_id", '"position"', "title", "description", "expected_days", "status",
                 "completed_at"], milestones))
    emit(insert("public.quest_tasks",
                ["id", "user_id", "quest_id", "milestone_id", "slot", "title", "detail", "est_minutes", "status",
                 "done_on"], tasks))
    emit(insert("public.quest_checkins",
                ["id", "user_id", "quest_id", "task_id", "body", "advisor_reply", "on_time", "xp_awarded",
                 "created_at"], checkins))
    emit(insert("public.quest_stats", ["user_id", "xp", "streak", "streak_date", "best_streak"], stats))
    emit(insert("public.essays",
                ["id", "user_id", "kind", "title", "prompt_key", "prompt_text", "school_name", "word_limit", "body",
                 "word_count", "status", "created_at", "updated_at"], essays))
    emit("-- Everyone is linked; what each one shares is their own mix.")
    emit(insert("public.school_links",
                ["student_id", "school_id", "share_college_list", "share_portfolio", "share_quest", "share_essays",
                 "linked_at"], links))

    requests = []
    for i, r in enumerate(REQUESTS):
        student = by_name[r["who"]]
        times = Raw("jsonb_build_array(" + ", ".join(f"to_jsonb({next_week(*t)})" for t in r["times"]) + ")")
        answered = r["status"] != "pending"
        requests.append((
            uid("request", i), student["id"], SCHOOL_ID, r["message"], times, r["status"],
            next_week(*r["meeting"]) if r["status"] == "confirmed" else None,
            r.get("note", ""), ago(hours=r["ago"]),
            ago(hours=r.get("answered_ago", max(r["ago"] - 20, 0))) if answered else ago(hours=r["ago"])))
    emit(insert("public.meeting_requests",
                ["id", "student_id", "school_id", "message", "times", "status", "meeting_at", "counselor_note",
                 "created_at", "updated_at"], requests))

    if counselor_email:
        emit("-- The login for whoever shows the demo: an account that already exists becomes a\n"
             "-- counselor of the demo school (and stops being one of any school it set up).\n"
             "DO $$\nDECLARE\n  v_user UUID;\nBEGIN\n"
             f"  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower({lit(counselor_email)})\n"
             "   ORDER BY u.created_at LIMIT 1;\n"
             "  IF v_user IS NULL THEN\n"
             "    RAISE EXCEPTION 'No account has that address. Sign up at /counselor with it first, then run this again. Nothing was changed.';\n"
             "  END IF;\n"
             "  -- A counselor is never a student of their own school.\n"
             f"  DELETE FROM public.school_links WHERE student_id = v_user AND school_id = {lit(SCHOOL_ID)};\n"
             "  INSERT INTO public.counselors (user_id, school_id, display_name)\n"
             f"  VALUES (v_user, {lit(SCHOOL_ID)}, 'Demo Counselor')\n"
             "  ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id;\n"
             "END;\n$$;\n")

    if transaction:
        emit("COMMIT;\n")

    emit("-- What is there now.\n"
         "SELECT s.name AS school, s.join_code,\n"
         "       (SELECT count(*) FROM public.school_links l WHERE l.school_id = s.id) AS students,\n"
         "       (SELECT count(*) FROM public.meeting_requests r WHERE r.school_id = s.id) AS requests,\n"
         "       (SELECT count(*) FROM public.counselors c WHERE c.school_id = s.id) AS counselors\n"
         f"  FROM public.schools s WHERE s.id = {lit(SCHOOL_ID)};\n")

    return "\n".join(part for part in out if part)


def check():
    """The promises in the docstring, held against the data above."""
    assert len(STUDENTS) == 25, len(STUDENTS)
    assert len({email_of(s) for s in STUDENTS}) == 25
    assert {s["grade"] for s in STUDENTS} == {9, 10, 11, 12}
    shares = [len(s["share"]) for s in STUDENTS]
    assert shares.count(4) == 10 and shares.count(0) == 5 and sum(1 for n in shares if 1 <= n <= 3) == 10, shares
    for s in STUDENTS:
        assert set(s["share"]) <= set(ALL), s["share"]
        assert len({index for index, _, _ in s["colleges"]}) == len(s["colleges"]), s["first"]
        for e in s["essays"]:
            assert 50 <= e["limit"] <= 1000 and 0 <= e["words"] <= 20000
        quest = s["quest"]
        if quest:
            assert 3 <= len(quest["milestones"]) <= 8 and quest["done"] <= len(quest["milestones"])
            assert quest["minutes"] in (15, 30, 45)
    statuses = [r["status"] for r in REQUESTS]
    assert sorted(statuses) == ["confirmed", "declined", "pending", "pending", "pending", "pending"], statuses
    names = {f"{s['first']} {s['last']}" for s in STUDENTS}
    for r in REQUESTS:
        assert r["who"] in names and 1 <= len(r["message"]) <= 300 and 1 <= len(r["times"]) <= 3
        assert len(r.get("note", "")) <= 300
    waiting = [r["who"] for r in REQUESTS if r["status"] == "pending"]
    assert len(set(waiting)) == len(waiting), "at most one waiting request a student here"


EMAIL = re.compile(r"^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$")


def main():
    parser = argparse.ArgumentParser(description="Print the SQL that builds the counselor demo school.")
    parser.add_argument("--counselor-email", metavar="ADDRESS",
                        help="make this existing account a counselor of the demo school")
    parser.add_argument("--no-transaction", action="store_true",
                        help="leave out BEGIN and COMMIT (to run inside a transaction of your own)")
    args = parser.parse_args()

    if args.counselor_email and not EMAIL.match(args.counselor_email):
        parser.error("that does not look like an email address")

    check()
    sql = build(counselor_email=args.counselor_email, transaction=not args.no_transaction)
    if chr(0x2014) in sql or chr(0xB7) in sql:
        sys.exit("an em dash or a middle dot got into the demo text")
    sys.stdout.write(sql + "\n")


if __name__ == "__main__":
    main()
