-- Remove the counselor demo: the 25 made-up students of "Riverbend High School
-- (demo)" and the school itself.
--
--   supabase db query --linked -f supabase/seed/clear_counselor_demo.sql
--
-- A demo student is an account whose profile is flagged is_demo AND whose
-- address is at demo.mentorable.invalid. Both must hold, so nothing here can
-- delete a real person's account: a flagged profile with any other address is
-- left alone and shows up in the count at the end. Deleting the account takes
-- everything of theirs with it (profile, record, college list, quest, essays,
-- the link to the school, meeting requests).
--
-- Deleting the school removes its counselor rows too. Whoever was given the
-- demo login with --counselor-email keeps their account; it just stops being a
-- counselor, and can set up a school of its own again.
--
-- Safe to run twice, and to run when there is no demo. The last row should be
-- three zeros. A 1 in the first column is a test account the owner flagged so
-- it could join the demo school (see seed_counselor_demo.py): it is unlinked
-- here with the school but kept, and stays flagged until the owner runs
--   UPDATE public.profiles SET is_demo = false WHERE id = '<that account>';

DELETE FROM auth.users u
 USING public.profiles p
 WHERE p.id = u.id
   AND p.is_demo
   AND u.email LIKE '%@demo.mentorable.invalid';

DELETE FROM public.schools s WHERE s.is_demo;

SELECT (SELECT count(*) FROM public.profiles p WHERE p.is_demo)                               AS demo_profiles_left,
       (SELECT count(*) FROM auth.users u WHERE u.email LIKE '%@demo.mentorable.invalid')     AS demo_accounts_left,
       (SELECT count(*) FROM public.schools s WHERE s.is_demo)                                AS demo_schools_left;
