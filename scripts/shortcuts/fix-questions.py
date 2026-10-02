"""Point each import question at its own Text action.

Cherri gives every `#question` ActionIndex 0, so with two questions the second
answer would overwrite the first (e.g. the food name replacing the Cut link).
Our sources store each answer with `text(question)` in order, so the Nth
question belongs to the Nth placeholder Text action.
"""
import plistlib
import sys

path = sys.argv[1]
with open(path, "rb") as f:
    wf = plistlib.load(f)

slots = [
    i for i, a in enumerate(wf["WFWorkflowActions"])
    if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.gettext"
    and a["WFWorkflowActionParameters"].get("WFTextActionText") == ""
]
questions = wf.get("WFWorkflowImportQuestions", [])
if len(slots) < len(questions):
    sys.exit(f"{path}: {len(questions)} questions but only {len(slots)} empty Text actions")
for q, idx in zip(questions, slots):
    q["ActionIndex"] = idx

with open(path, "wb") as f:
    plistlib.dump(wf, f, fmt=plistlib.FMT_BINARY)
