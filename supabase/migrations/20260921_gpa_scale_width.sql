-- Widen the GPA columns so a 100-point scale actually fits.
--
-- The intake form offers a "100 point" GPA scale (and the gpa_scale comment in
-- 20260921_college_pivot.sql lists it), but the columns were NUMERIC(5,3),
-- which holds at most 99.999. A student on that scale entering 100 -- or a
-- weighted GPA above 100, which some districts issue -- overflowed the insert.
--
-- NUMERIC(6,3) holds up to 999.999, which covers every scale the form offers
-- while keeping the three decimal places.
ALTER TABLE profiles
  ALTER COLUMN gpa_unweighted TYPE NUMERIC(6,3),
  ALTER COLUMN gpa_weighted   TYPE NUMERIC(6,3);
