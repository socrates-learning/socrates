# Flexible Concept Network Architecture

Core rule: **concepts are independent objects**. Categories, libraries, textbook paths, classes, and exams are only different ways to organize or find those concepts.

Example: `ACE Inhibitors` can appear in:

- Pharmacology → Cardiovascular Pharmacology → Hypertension Drugs
- Physiology → RAAS / Renal-Cardiovascular Physiology
- Cardiology → Heart Failure
- Pediatrics → Pediatric Hypertension
- NCLEX → High-Yield Medication Safety

The user's mastery belongs to the concept itself, not one folder path. This prevents duplicated learning scores when the same idea appears in multiple places.

## Key tables

- `concepts`: the actual knowledge item being learned and scored.
- `category_trees`: user-created organization systems, such as Pharmacology, NCLEX, My Class, Exam 1, Pediatrics.
- `category_nodes`: nested categories/subcategories inside a tree.
- `concept_category_links`: many-to-many links placing a concept under any number of categories.
- `labels` and `concept_labels`: flexible tags such as high-yield, pediatrics, renal, exam-1, weak-area.
- `concept_relationships`: graph links between concepts, such as causes, treats, contraindicated_with, confused_with, prerequisite_for.

## Why this matters

The app should never assume we already know every future category. Users need to add their own organization without changing the database design.

## Unified Creator Studio cutover prerequisite

The existing staff Creator Studio and learner Study Creator remain separate,
parallel routes until the unified experience reaches full feature and security
parity. The shared UI layer must preserve source-qualified official and personal
identities; it must never merge their storage, ownership, write paths, or RLS.

Before any future learner-capable `/creator` parent route exposes its current
descendants, audit and harden legacy Article draft write policies if Articles
remain staff-only official authoring. Route-level staff checks are not a
substitute for table/RPC authorization. Do not expose Article Editor or Library
Organizer descendants to learners until that database authorization gate has
passed.
