"""
The counselor dashboard's backend, which is one job: the daily email telling a
counselor that students asked for a meeting (digest.py).

Everything else a counselor sees is read in the browser through SQL functions
that check the student's sharing choices themselves. Nothing here reads a
student's record, and the service role is used only for the email's own ledger.
"""
