-- Remove the Context page / annotations feature (deleted from the product).
-- It was the only writer/reader of context_annotations; the chat prompt no
-- longer applies annotations. No remaining references in app or langgraph-service.
DROP TABLE IF EXISTS context_annotations CASCADE;
