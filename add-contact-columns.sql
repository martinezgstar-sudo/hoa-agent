-- add-contact-columns.sql
-- Adds contact-capture columns to the communities table for the research
-- pipeline (phone + email). Idempotent; safe to re-run.
--
-- Review before running. Do NOT run automatically.

alter table communities add column if not exists phone text;
alter table communities add column if not exists email text;
