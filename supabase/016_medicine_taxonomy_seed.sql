-- Seed the Medicine curriculum category tree without creating concept content.

do $seed$
declare
  node_record record;
  node_ids jsonb := '{}'::jsonb;
  current_node_id uuid;
  parent_node_id uuid;
  medicine_library_id uuid;
  resolved_node_count integer;
begin
  for node_record in
    select *
    from (
      values
        (0, 'Medicine', null, 'Medicine', 'section', 0),

        (1, 'Medicine / Foundational Sciences', 'Medicine', 'Foundational Sciences', 'section', 0),
        (1, 'Medicine / Organ Systems', 'Medicine', 'Organ Systems', 'section', 1),
        (1, 'Medicine / Clinical Medicine', 'Medicine', 'Clinical Medicine', 'section', 2),
        (1, 'Medicine / Diagnostics', 'Medicine', 'Diagnostics', 'section', 3),
        (1, 'Medicine / Pharmacology', 'Medicine', 'Pharmacology', 'section', 4),
        (1, 'Medicine / USMLE Review', 'Medicine', 'USMLE Review', 'section', 5),

        (2, 'Medicine / Foundational Sciences / Anatomy', 'Medicine / Foundational Sciences', 'Anatomy', 'chapter', 0),
        (2, 'Medicine / Foundational Sciences / Physiology', 'Medicine / Foundational Sciences', 'Physiology', 'chapter', 1),
        (2, 'Medicine / Foundational Sciences / Biochemistry', 'Medicine / Foundational Sciences', 'Biochemistry', 'chapter', 2),
        (2, 'Medicine / Foundational Sciences / Pathology', 'Medicine / Foundational Sciences', 'Pathology', 'chapter', 3),
        (2, 'Medicine / Foundational Sciences / Immunology', 'Medicine / Foundational Sciences', 'Immunology', 'chapter', 4),
        (2, 'Medicine / Foundational Sciences / Microbiology', 'Medicine / Foundational Sciences', 'Microbiology', 'chapter', 5),
        (2, 'Medicine / Foundational Sciences / Genetics', 'Medicine / Foundational Sciences', 'Genetics', 'chapter', 6),
        (2, 'Medicine / Foundational Sciences / Biostatistics', 'Medicine / Foundational Sciences', 'Biostatistics', 'chapter', 7),
        (2, 'Medicine / Foundational Sciences / Behavioral Science', 'Medicine / Foundational Sciences', 'Behavioral Science', 'chapter', 8),

        (3, 'Medicine / Foundational Sciences / Anatomy / Gross Anatomy', 'Medicine / Foundational Sciences / Anatomy', 'Gross Anatomy', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Anatomy / Histology', 'Medicine / Foundational Sciences / Anatomy', 'Histology', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Anatomy / Embryology', 'Medicine / Foundational Sciences / Anatomy', 'Embryology', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Anatomy / Neuroanatomy', 'Medicine / Foundational Sciences / Anatomy', 'Neuroanatomy', 'topic', 3),

        (3, 'Medicine / Foundational Sciences / Physiology / Cellular Physiology', 'Medicine / Foundational Sciences / Physiology', 'Cellular Physiology', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Physiology / Cardiovascular Physiology', 'Medicine / Foundational Sciences / Physiology', 'Cardiovascular Physiology', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Physiology / Respiratory Physiology', 'Medicine / Foundational Sciences / Physiology', 'Respiratory Physiology', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Physiology / Renal Physiology', 'Medicine / Foundational Sciences / Physiology', 'Renal Physiology', 'topic', 3),
        (3, 'Medicine / Foundational Sciences / Physiology / Gastrointestinal Physiology', 'Medicine / Foundational Sciences / Physiology', 'Gastrointestinal Physiology', 'topic', 4),
        (3, 'Medicine / Foundational Sciences / Physiology / Endocrine Physiology', 'Medicine / Foundational Sciences / Physiology', 'Endocrine Physiology', 'topic', 5),
        (3, 'Medicine / Foundational Sciences / Physiology / Neurophysiology', 'Medicine / Foundational Sciences / Physiology', 'Neurophysiology', 'topic', 6),

        (3, 'Medicine / Foundational Sciences / Biochemistry / Biomolecules', 'Medicine / Foundational Sciences / Biochemistry', 'Biomolecules', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Biochemistry / Enzymes and Kinetics', 'Medicine / Foundational Sciences / Biochemistry', 'Enzymes and Kinetics', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Biochemistry / Metabolism', 'Medicine / Foundational Sciences / Biochemistry', 'Metabolism', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Biochemistry / Molecular Biology', 'Medicine / Foundational Sciences / Biochemistry', 'Molecular Biology', 'topic', 3),
        (3, 'Medicine / Foundational Sciences / Biochemistry / Nutrition', 'Medicine / Foundational Sciences / Biochemistry', 'Nutrition', 'topic', 4),

        (3, 'Medicine / Foundational Sciences / Pathology / Cellular Injury', 'Medicine / Foundational Sciences / Pathology', 'Cellular Injury', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Pathology / Inflammation and Repair', 'Medicine / Foundational Sciences / Pathology', 'Inflammation and Repair', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Pathology / Hemodynamic Disorders', 'Medicine / Foundational Sciences / Pathology', 'Hemodynamic Disorders', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Pathology / Neoplasia', 'Medicine / Foundational Sciences / Pathology', 'Neoplasia', 'topic', 3),
        (3, 'Medicine / Foundational Sciences / Pathology / Environmental Disease', 'Medicine / Foundational Sciences / Pathology', 'Environmental Disease', 'topic', 4),

        (3, 'Medicine / Foundational Sciences / Immunology / Innate Immunity', 'Medicine / Foundational Sciences / Immunology', 'Innate Immunity', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Immunology / Adaptive Immunity', 'Medicine / Foundational Sciences / Immunology', 'Adaptive Immunity', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Immunology / Hypersensitivity', 'Medicine / Foundational Sciences / Immunology', 'Hypersensitivity', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Immunology / Immunodeficiency', 'Medicine / Foundational Sciences / Immunology', 'Immunodeficiency', 'topic', 3),
        (3, 'Medicine / Foundational Sciences / Immunology / Autoimmunity and Transplantation', 'Medicine / Foundational Sciences / Immunology', 'Autoimmunity and Transplantation', 'topic', 4),

        (3, 'Medicine / Foundational Sciences / Microbiology / Bacteriology', 'Medicine / Foundational Sciences / Microbiology', 'Bacteriology', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Microbiology / Virology', 'Medicine / Foundational Sciences / Microbiology', 'Virology', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Microbiology / Mycology', 'Medicine / Foundational Sciences / Microbiology', 'Mycology', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Microbiology / Parasitology', 'Medicine / Foundational Sciences / Microbiology', 'Parasitology', 'topic', 3),
        (3, 'Medicine / Foundational Sciences / Microbiology / Microbial Genetics', 'Medicine / Foundational Sciences / Microbiology', 'Microbial Genetics', 'topic', 4),
        (3, 'Medicine / Foundational Sciences / Microbiology / Infection Prevention', 'Medicine / Foundational Sciences / Microbiology', 'Infection Prevention', 'topic', 5),

        (3, 'Medicine / Foundational Sciences / Genetics / Mendelian Inheritance', 'Medicine / Foundational Sciences / Genetics', 'Mendelian Inheritance', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Genetics / Cytogenetics', 'Medicine / Foundational Sciences / Genetics', 'Cytogenetics', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Genetics / Molecular Genetics', 'Medicine / Foundational Sciences / Genetics', 'Molecular Genetics', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Genetics / Population Genetics', 'Medicine / Foundational Sciences / Genetics', 'Population Genetics', 'topic', 3),

        (3, 'Medicine / Foundational Sciences / Biostatistics / Study Designs', 'Medicine / Foundational Sciences / Biostatistics', 'Study Designs', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Biostatistics / Measures of Disease', 'Medicine / Foundational Sciences / Biostatistics', 'Measures of Disease', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Biostatistics / Hypothesis Testing', 'Medicine / Foundational Sciences / Biostatistics', 'Hypothesis Testing', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Biostatistics / Diagnostic Test Statistics', 'Medicine / Foundational Sciences / Biostatistics', 'Diagnostic Test Statistics', 'topic', 3),
        (3, 'Medicine / Foundational Sciences / Biostatistics / Evidence-Based Medicine', 'Medicine / Foundational Sciences / Biostatistics', 'Evidence-Based Medicine', 'topic', 4),

        (3, 'Medicine / Foundational Sciences / Behavioral Science / Human Development', 'Medicine / Foundational Sciences / Behavioral Science', 'Human Development', 'topic', 0),
        (3, 'Medicine / Foundational Sciences / Behavioral Science / Medical Ethics', 'Medicine / Foundational Sciences / Behavioral Science', 'Medical Ethics', 'topic', 1),
        (3, 'Medicine / Foundational Sciences / Behavioral Science / Patient Communication', 'Medicine / Foundational Sciences / Behavioral Science', 'Patient Communication', 'topic', 2),
        (3, 'Medicine / Foundational Sciences / Behavioral Science / Social Determinants of Health', 'Medicine / Foundational Sciences / Behavioral Science', 'Social Determinants of Health', 'topic', 3),
        (3, 'Medicine / Foundational Sciences / Behavioral Science / Substance Use', 'Medicine / Foundational Sciences / Behavioral Science', 'Substance Use', 'topic', 4),

        (2, 'Medicine / Organ Systems / Cardiovascular', 'Medicine / Organ Systems', 'Cardiovascular', 'chapter', 0),
        (2, 'Medicine / Organ Systems / Respiratory', 'Medicine / Organ Systems', 'Respiratory', 'chapter', 1),
        (2, 'Medicine / Organ Systems / Renal', 'Medicine / Organ Systems', 'Renal', 'chapter', 2),
        (2, 'Medicine / Organ Systems / Gastrointestinal', 'Medicine / Organ Systems', 'Gastrointestinal', 'chapter', 3),
        (2, 'Medicine / Organ Systems / Endocrine', 'Medicine / Organ Systems', 'Endocrine', 'chapter', 4),
        (2, 'Medicine / Organ Systems / Hematology', 'Medicine / Organ Systems', 'Hematology', 'chapter', 5),
        (2, 'Medicine / Organ Systems / Neurology', 'Medicine / Organ Systems', 'Neurology', 'chapter', 6),
        (2, 'Medicine / Organ Systems / Musculoskeletal', 'Medicine / Organ Systems', 'Musculoskeletal', 'chapter', 7),
        (2, 'Medicine / Organ Systems / Dermatology', 'Medicine / Organ Systems', 'Dermatology', 'chapter', 8),
        (2, 'Medicine / Organ Systems / Reproductive', 'Medicine / Organ Systems', 'Reproductive', 'chapter', 9),
        (2, 'Medicine / Organ Systems / Psychiatry', 'Medicine / Organ Systems', 'Psychiatry', 'chapter', 10),
        (2, 'Medicine / Organ Systems / Ophthalmology', 'Medicine / Organ Systems', 'Ophthalmology', 'chapter', 11),
        (2, 'Medicine / Organ Systems / Otolaryngology', 'Medicine / Organ Systems', 'Otolaryngology', 'chapter', 12),

        (3, 'Medicine / Organ Systems / Cardiovascular / Cardiovascular Anatomy and Physiology', 'Medicine / Organ Systems / Cardiovascular', 'Cardiovascular Anatomy and Physiology', 'topic', 0),
        (3, 'Medicine / Organ Systems / Cardiovascular / Ischemic Heart Disease', 'Medicine / Organ Systems / Cardiovascular', 'Ischemic Heart Disease', 'topic', 1),
        (3, 'Medicine / Organ Systems / Cardiovascular / Heart Failure', 'Medicine / Organ Systems / Cardiovascular', 'Heart Failure', 'topic', 2),
        (3, 'Medicine / Organ Systems / Cardiovascular / Arrhythmias', 'Medicine / Organ Systems / Cardiovascular', 'Arrhythmias', 'topic', 3),
        (3, 'Medicine / Organ Systems / Cardiovascular / Valvular Disease', 'Medicine / Organ Systems / Cardiovascular', 'Valvular Disease', 'topic', 4),
        (3, 'Medicine / Organ Systems / Cardiovascular / Vascular Disease', 'Medicine / Organ Systems / Cardiovascular', 'Vascular Disease', 'topic', 5),
        (3, 'Medicine / Organ Systems / Cardiovascular / Congenital Heart Disease', 'Medicine / Organ Systems / Cardiovascular', 'Congenital Heart Disease', 'topic', 6),

        (3, 'Medicine / Organ Systems / Respiratory / Respiratory Mechanics', 'Medicine / Organ Systems / Respiratory', 'Respiratory Mechanics', 'topic', 0),
        (3, 'Medicine / Organ Systems / Respiratory / Obstructive Lung Disease', 'Medicine / Organ Systems / Respiratory', 'Obstructive Lung Disease', 'topic', 1),
        (3, 'Medicine / Organ Systems / Respiratory / Restrictive Lung Disease', 'Medicine / Organ Systems / Respiratory', 'Restrictive Lung Disease', 'topic', 2),
        (3, 'Medicine / Organ Systems / Respiratory / Pulmonary Vascular Disease', 'Medicine / Organ Systems / Respiratory', 'Pulmonary Vascular Disease', 'topic', 3),
        (3, 'Medicine / Organ Systems / Respiratory / Respiratory Infections', 'Medicine / Organ Systems / Respiratory', 'Respiratory Infections', 'topic', 4),
        (3, 'Medicine / Organ Systems / Respiratory / Pleural Disease', 'Medicine / Organ Systems / Respiratory', 'Pleural Disease', 'topic', 5),

        (3, 'Medicine / Organ Systems / Renal / Glomerular Function', 'Medicine / Organ Systems / Renal', 'Glomerular Function', 'topic', 0),
        (3, 'Medicine / Organ Systems / Renal / Acid-Base Disorders', 'Medicine / Organ Systems / Renal', 'Acid-Base Disorders', 'topic', 1),
        (3, 'Medicine / Organ Systems / Renal / Electrolyte Disorders', 'Medicine / Organ Systems / Renal', 'Electrolyte Disorders', 'topic', 2),
        (3, 'Medicine / Organ Systems / Renal / Acute Kidney Injury', 'Medicine / Organ Systems / Renal', 'Acute Kidney Injury', 'topic', 3),
        (3, 'Medicine / Organ Systems / Renal / Chronic Kidney Disease', 'Medicine / Organ Systems / Renal', 'Chronic Kidney Disease', 'topic', 4),
        (3, 'Medicine / Organ Systems / Renal / Glomerular Disease', 'Medicine / Organ Systems / Renal', 'Glomerular Disease', 'topic', 5),
        (3, 'Medicine / Organ Systems / Renal / Tubulointerstitial Disease', 'Medicine / Organ Systems / Renal', 'Tubulointerstitial Disease', 'topic', 6),

        (3, 'Medicine / Organ Systems / Gastrointestinal / Esophagus and Stomach', 'Medicine / Organ Systems / Gastrointestinal', 'Esophagus and Stomach', 'topic', 0),
        (3, 'Medicine / Organ Systems / Gastrointestinal / Small and Large Intestine', 'Medicine / Organ Systems / Gastrointestinal', 'Small and Large Intestine', 'topic', 1),
        (3, 'Medicine / Organ Systems / Gastrointestinal / Liver Disease', 'Medicine / Organ Systems / Gastrointestinal', 'Liver Disease', 'topic', 2),
        (3, 'Medicine / Organ Systems / Gastrointestinal / Biliary Disease', 'Medicine / Organ Systems / Gastrointestinal', 'Biliary Disease', 'topic', 3),
        (3, 'Medicine / Organ Systems / Gastrointestinal / Pancreatic Disease', 'Medicine / Organ Systems / Gastrointestinal', 'Pancreatic Disease', 'topic', 4),
        (3, 'Medicine / Organ Systems / Gastrointestinal / Malabsorption and Nutrition', 'Medicine / Organ Systems / Gastrointestinal', 'Malabsorption and Nutrition', 'topic', 5),

        (3, 'Medicine / Organ Systems / Endocrine / Pituitary Disorders', 'Medicine / Organ Systems / Endocrine', 'Pituitary Disorders', 'topic', 0),
        (3, 'Medicine / Organ Systems / Endocrine / Thyroid Disorders', 'Medicine / Organ Systems / Endocrine', 'Thyroid Disorders', 'topic', 1),
        (3, 'Medicine / Organ Systems / Endocrine / Adrenal Disorders', 'Medicine / Organ Systems / Endocrine', 'Adrenal Disorders', 'topic', 2),
        (3, 'Medicine / Organ Systems / Endocrine / Diabetes Mellitus', 'Medicine / Organ Systems / Endocrine', 'Diabetes Mellitus', 'topic', 3),
        (3, 'Medicine / Organ Systems / Endocrine / Calcium and Bone Metabolism', 'Medicine / Organ Systems / Endocrine', 'Calcium and Bone Metabolism', 'topic', 4),
        (3, 'Medicine / Organ Systems / Endocrine / Reproductive Endocrinology', 'Medicine / Organ Systems / Endocrine', 'Reproductive Endocrinology', 'topic', 5),

        (3, 'Medicine / Organ Systems / Hematology / Red Blood Cell Disorders', 'Medicine / Organ Systems / Hematology', 'Red Blood Cell Disorders', 'topic', 0),
        (3, 'Medicine / Organ Systems / Hematology / White Blood Cell Disorders', 'Medicine / Organ Systems / Hematology', 'White Blood Cell Disorders', 'topic', 1),
        (3, 'Medicine / Organ Systems / Hematology / Coagulation Disorders', 'Medicine / Organ Systems / Hematology', 'Coagulation Disorders', 'topic', 2),
        (3, 'Medicine / Organ Systems / Hematology / Transfusion Medicine', 'Medicine / Organ Systems / Hematology', 'Transfusion Medicine', 'topic', 3),
        (3, 'Medicine / Organ Systems / Hematology / Hematologic Malignancies', 'Medicine / Organ Systems / Hematology', 'Hematologic Malignancies', 'topic', 4),

        (3, 'Medicine / Organ Systems / Neurology / Neurologic Localization', 'Medicine / Organ Systems / Neurology', 'Neurologic Localization', 'topic', 0),
        (3, 'Medicine / Organ Systems / Neurology / Cerebrovascular Disease', 'Medicine / Organ Systems / Neurology', 'Cerebrovascular Disease', 'topic', 1),
        (3, 'Medicine / Organ Systems / Neurology / Seizure Disorders', 'Medicine / Organ Systems / Neurology', 'Seizure Disorders', 'topic', 2),
        (3, 'Medicine / Organ Systems / Neurology / Neurodegenerative Disease', 'Medicine / Organ Systems / Neurology', 'Neurodegenerative Disease', 'topic', 3),
        (3, 'Medicine / Organ Systems / Neurology / Demyelinating Disease', 'Medicine / Organ Systems / Neurology', 'Demyelinating Disease', 'topic', 4),
        (3, 'Medicine / Organ Systems / Neurology / Peripheral Neuropathy', 'Medicine / Organ Systems / Neurology', 'Peripheral Neuropathy', 'topic', 5),
        (3, 'Medicine / Organ Systems / Neurology / Headache Disorders', 'Medicine / Organ Systems / Neurology', 'Headache Disorders', 'topic', 6),

        (3, 'Medicine / Organ Systems / Musculoskeletal / Bone Disorders', 'Medicine / Organ Systems / Musculoskeletal', 'Bone Disorders', 'topic', 0),
        (3, 'Medicine / Organ Systems / Musculoskeletal / Joint Disorders', 'Medicine / Organ Systems / Musculoskeletal', 'Joint Disorders', 'topic', 1),
        (3, 'Medicine / Organ Systems / Musculoskeletal / Muscle Disorders', 'Medicine / Organ Systems / Musculoskeletal', 'Muscle Disorders', 'topic', 2),
        (3, 'Medicine / Organ Systems / Musculoskeletal / Rheumatologic Disease', 'Medicine / Organ Systems / Musculoskeletal', 'Rheumatologic Disease', 'topic', 3),
        (3, 'Medicine / Organ Systems / Musculoskeletal / Orthopedic Trauma', 'Medicine / Organ Systems / Musculoskeletal', 'Orthopedic Trauma', 'topic', 4),

        (3, 'Medicine / Organ Systems / Dermatology / Inflammatory Skin Disease', 'Medicine / Organ Systems / Dermatology', 'Inflammatory Skin Disease', 'topic', 0),
        (3, 'Medicine / Organ Systems / Dermatology / Infectious Skin Disease', 'Medicine / Organ Systems / Dermatology', 'Infectious Skin Disease', 'topic', 1),
        (3, 'Medicine / Organ Systems / Dermatology / Skin Neoplasms', 'Medicine / Organ Systems / Dermatology', 'Skin Neoplasms', 'topic', 2),
        (3, 'Medicine / Organ Systems / Dermatology / Bullous Disorders', 'Medicine / Organ Systems / Dermatology', 'Bullous Disorders', 'topic', 3),
        (3, 'Medicine / Organ Systems / Dermatology / Hair and Nail Disorders', 'Medicine / Organ Systems / Dermatology', 'Hair and Nail Disorders', 'topic', 4),

        (3, 'Medicine / Organ Systems / Reproductive / Male Reproductive System', 'Medicine / Organ Systems / Reproductive', 'Male Reproductive System', 'topic', 0),
        (3, 'Medicine / Organ Systems / Reproductive / Female Reproductive System', 'Medicine / Organ Systems / Reproductive', 'Female Reproductive System', 'topic', 1),
        (3, 'Medicine / Organ Systems / Reproductive / Pregnancy Physiology', 'Medicine / Organ Systems / Reproductive', 'Pregnancy Physiology', 'topic', 2),
        (3, 'Medicine / Organ Systems / Reproductive / Infertility', 'Medicine / Organ Systems / Reproductive', 'Infertility', 'topic', 3),
        (3, 'Medicine / Organ Systems / Reproductive / Sexual Health', 'Medicine / Organ Systems / Reproductive', 'Sexual Health', 'topic', 4),

        (3, 'Medicine / Organ Systems / Psychiatry / Mood Disorders', 'Medicine / Organ Systems / Psychiatry', 'Mood Disorders', 'topic', 0),
        (3, 'Medicine / Organ Systems / Psychiatry / Anxiety Disorders', 'Medicine / Organ Systems / Psychiatry', 'Anxiety Disorders', 'topic', 1),
        (3, 'Medicine / Organ Systems / Psychiatry / Psychotic Disorders', 'Medicine / Organ Systems / Psychiatry', 'Psychotic Disorders', 'topic', 2),
        (3, 'Medicine / Organ Systems / Psychiatry / Personality Disorders', 'Medicine / Organ Systems / Psychiatry', 'Personality Disorders', 'topic', 3),
        (3, 'Medicine / Organ Systems / Psychiatry / Child Psychiatry', 'Medicine / Organ Systems / Psychiatry', 'Child Psychiatry', 'topic', 4),

        (3, 'Medicine / Organ Systems / Ophthalmology / Visual Optics', 'Medicine / Organ Systems / Ophthalmology', 'Visual Optics', 'topic', 0),
        (3, 'Medicine / Organ Systems / Ophthalmology / Retinal Disease', 'Medicine / Organ Systems / Ophthalmology', 'Retinal Disease', 'topic', 1),
        (3, 'Medicine / Organ Systems / Ophthalmology / Glaucoma', 'Medicine / Organ Systems / Ophthalmology', 'Glaucoma', 'topic', 2),
        (3, 'Medicine / Organ Systems / Ophthalmology / Ocular Emergencies', 'Medicine / Organ Systems / Ophthalmology', 'Ocular Emergencies', 'topic', 3),

        (3, 'Medicine / Organ Systems / Otolaryngology / Hearing Disorders', 'Medicine / Organ Systems / Otolaryngology', 'Hearing Disorders', 'topic', 0),
        (3, 'Medicine / Organ Systems / Otolaryngology / Vestibular Disorders', 'Medicine / Organ Systems / Otolaryngology', 'Vestibular Disorders', 'topic', 1),
        (3, 'Medicine / Organ Systems / Otolaryngology / Upper Airway Disease', 'Medicine / Organ Systems / Otolaryngology', 'Upper Airway Disease', 'topic', 2),
        (3, 'Medicine / Organ Systems / Otolaryngology / Head and Neck Disease', 'Medicine / Organ Systems / Otolaryngology', 'Head and Neck Disease', 'topic', 3),

        (2, 'Medicine / Clinical Medicine / Internal Medicine', 'Medicine / Clinical Medicine', 'Internal Medicine', 'chapter', 0),
        (2, 'Medicine / Clinical Medicine / Surgery', 'Medicine / Clinical Medicine', 'Surgery', 'chapter', 1),
        (2, 'Medicine / Clinical Medicine / Pediatrics', 'Medicine / Clinical Medicine', 'Pediatrics', 'chapter', 2),
        (2, 'Medicine / Clinical Medicine / OB-GYN', 'Medicine / Clinical Medicine', 'OB-GYN', 'chapter', 3),
        (2, 'Medicine / Clinical Medicine / Emergency Medicine', 'Medicine / Clinical Medicine', 'Emergency Medicine', 'chapter', 4),
        (2, 'Medicine / Clinical Medicine / Family Medicine', 'Medicine / Clinical Medicine', 'Family Medicine', 'chapter', 5),
        (2, 'Medicine / Clinical Medicine / Preventive Medicine', 'Medicine / Clinical Medicine', 'Preventive Medicine', 'chapter', 6),
        (2, 'Medicine / Clinical Medicine / Psychiatry', 'Medicine / Clinical Medicine', 'Psychiatry', 'chapter', 7),
        (2, 'Medicine / Clinical Medicine / Anesthesiology', 'Medicine / Clinical Medicine', 'Anesthesiology', 'chapter', 8),
        (2, 'Medicine / Clinical Medicine / Critical Care', 'Medicine / Clinical Medicine', 'Critical Care', 'chapter', 9),

        (3, 'Medicine / Clinical Medicine / Internal Medicine / Cardiology', 'Medicine / Clinical Medicine / Internal Medicine', 'Cardiology', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Pulmonology', 'Medicine / Clinical Medicine / Internal Medicine', 'Pulmonology', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Nephrology', 'Medicine / Clinical Medicine / Internal Medicine', 'Nephrology', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Gastroenterology', 'Medicine / Clinical Medicine / Internal Medicine', 'Gastroenterology', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Endocrinology', 'Medicine / Clinical Medicine / Internal Medicine', 'Endocrinology', 'topic', 4),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Hematology and Oncology', 'Medicine / Clinical Medicine / Internal Medicine', 'Hematology and Oncology', 'topic', 5),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Infectious Disease', 'Medicine / Clinical Medicine / Internal Medicine', 'Infectious Disease', 'topic', 6),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Rheumatology', 'Medicine / Clinical Medicine / Internal Medicine', 'Rheumatology', 'topic', 7),
        (3, 'Medicine / Clinical Medicine / Internal Medicine / Geriatrics', 'Medicine / Clinical Medicine / Internal Medicine', 'Geriatrics', 'topic', 8),

        (3, 'Medicine / Clinical Medicine / Surgery / Surgical Principles', 'Medicine / Clinical Medicine / Surgery', 'Surgical Principles', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Surgery / General Surgery', 'Medicine / Clinical Medicine / Surgery', 'General Surgery', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Surgery / Trauma Surgery', 'Medicine / Clinical Medicine / Surgery', 'Trauma Surgery', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Surgery / Cardiothoracic Surgery', 'Medicine / Clinical Medicine / Surgery', 'Cardiothoracic Surgery', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Surgery / Neurosurgery', 'Medicine / Clinical Medicine / Surgery', 'Neurosurgery', 'topic', 4),
        (3, 'Medicine / Clinical Medicine / Surgery / Orthopedic Surgery', 'Medicine / Clinical Medicine / Surgery', 'Orthopedic Surgery', 'topic', 5),
        (3, 'Medicine / Clinical Medicine / Surgery / Urology', 'Medicine / Clinical Medicine / Surgery', 'Urology', 'topic', 6),

        (3, 'Medicine / Clinical Medicine / Pediatrics / Neonatology', 'Medicine / Clinical Medicine / Pediatrics', 'Neonatology', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Pediatrics / Growth and Development', 'Medicine / Clinical Medicine / Pediatrics', 'Growth and Development', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Pediatrics / Common Pediatric Illnesses', 'Medicine / Clinical Medicine / Pediatrics', 'Common Pediatric Illnesses', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Pediatrics / Congenital Disorders', 'Medicine / Clinical Medicine / Pediatrics', 'Congenital Disorders', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Pediatrics / Pediatric Emergencies', 'Medicine / Clinical Medicine / Pediatrics', 'Pediatric Emergencies', 'topic', 4),
        (3, 'Medicine / Clinical Medicine / Pediatrics / Adolescent Medicine', 'Medicine / Clinical Medicine / Pediatrics', 'Adolescent Medicine', 'topic', 5),

        (3, 'Medicine / Clinical Medicine / OB-GYN / Prenatal Care', 'Medicine / Clinical Medicine / OB-GYN', 'Prenatal Care', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / OB-GYN / Labor and Delivery', 'Medicine / Clinical Medicine / OB-GYN', 'Labor and Delivery', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / OB-GYN / Pregnancy Complications', 'Medicine / Clinical Medicine / OB-GYN', 'Pregnancy Complications', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / OB-GYN / Gynecologic Disorders', 'Medicine / Clinical Medicine / OB-GYN', 'Gynecologic Disorders', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / OB-GYN / Gynecologic Oncology', 'Medicine / Clinical Medicine / OB-GYN', 'Gynecologic Oncology', 'topic', 4),
        (3, 'Medicine / Clinical Medicine / OB-GYN / Contraception', 'Medicine / Clinical Medicine / OB-GYN', 'Contraception', 'topic', 5),

        (3, 'Medicine / Clinical Medicine / Emergency Medicine / Resuscitation', 'Medicine / Clinical Medicine / Emergency Medicine', 'Resuscitation', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Emergency Medicine / Shock', 'Medicine / Clinical Medicine / Emergency Medicine', 'Shock', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Emergency Medicine / Toxicology', 'Medicine / Clinical Medicine / Emergency Medicine', 'Toxicology', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Emergency Medicine / Acute Trauma', 'Medicine / Clinical Medicine / Emergency Medicine', 'Acute Trauma', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Emergency Medicine / Environmental Emergencies', 'Medicine / Clinical Medicine / Emergency Medicine', 'Environmental Emergencies', 'topic', 4),
        (3, 'Medicine / Clinical Medicine / Emergency Medicine / Acute Cardiac and Neurologic Care', 'Medicine / Clinical Medicine / Emergency Medicine', 'Acute Cardiac and Neurologic Care', 'topic', 5),

        (3, 'Medicine / Clinical Medicine / Family Medicine / Adult Preventive Care', 'Medicine / Clinical Medicine / Family Medicine', 'Adult Preventive Care', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Family Medicine / Chronic Disease Management', 'Medicine / Clinical Medicine / Family Medicine', 'Chronic Disease Management', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Family Medicine / Ambulatory Care', 'Medicine / Clinical Medicine / Family Medicine', 'Ambulatory Care', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Family Medicine / Geriatric Primary Care', 'Medicine / Clinical Medicine / Family Medicine', 'Geriatric Primary Care', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Family Medicine / Palliative Care', 'Medicine / Clinical Medicine / Family Medicine', 'Palliative Care', 'topic', 4),

        (3, 'Medicine / Clinical Medicine / Preventive Medicine / Epidemiology', 'Medicine / Clinical Medicine / Preventive Medicine', 'Epidemiology', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Preventive Medicine / Screening Programs', 'Medicine / Clinical Medicine / Preventive Medicine', 'Screening Programs', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Preventive Medicine / Immunization', 'Medicine / Clinical Medicine / Preventive Medicine', 'Immunization', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Preventive Medicine / Occupational Medicine', 'Medicine / Clinical Medicine / Preventive Medicine', 'Occupational Medicine', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Preventive Medicine / Public Health', 'Medicine / Clinical Medicine / Preventive Medicine', 'Public Health', 'topic', 4),

        (3, 'Medicine / Clinical Medicine / Psychiatry / Psychiatric Assessment', 'Medicine / Clinical Medicine / Psychiatry', 'Psychiatric Assessment', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Psychiatry / Psychopharmacology', 'Medicine / Clinical Medicine / Psychiatry', 'Psychopharmacology', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Psychiatry / Psychotherapy', 'Medicine / Clinical Medicine / Psychiatry', 'Psychotherapy', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Psychiatry / Psychiatric Emergencies', 'Medicine / Clinical Medicine / Psychiatry', 'Psychiatric Emergencies', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Psychiatry / Consultation Psychiatry', 'Medicine / Clinical Medicine / Psychiatry', 'Consultation Psychiatry', 'topic', 4),

        (3, 'Medicine / Clinical Medicine / Anesthesiology / Preoperative Assessment', 'Medicine / Clinical Medicine / Anesthesiology', 'Preoperative Assessment', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Anesthesiology / General Anesthesia', 'Medicine / Clinical Medicine / Anesthesiology', 'General Anesthesia', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Anesthesiology / Regional Anesthesia', 'Medicine / Clinical Medicine / Anesthesiology', 'Regional Anesthesia', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Anesthesiology / Perioperative Complications', 'Medicine / Clinical Medicine / Anesthesiology', 'Perioperative Complications', 'topic', 3),

        (3, 'Medicine / Clinical Medicine / Critical Care / Mechanical Ventilation', 'Medicine / Clinical Medicine / Critical Care', 'Mechanical Ventilation', 'topic', 0),
        (3, 'Medicine / Clinical Medicine / Critical Care / Hemodynamic Support', 'Medicine / Clinical Medicine / Critical Care', 'Hemodynamic Support', 'topic', 1),
        (3, 'Medicine / Clinical Medicine / Critical Care / Sepsis', 'Medicine / Clinical Medicine / Critical Care', 'Sepsis', 'topic', 2),
        (3, 'Medicine / Clinical Medicine / Critical Care / Multiorgan Failure', 'Medicine / Clinical Medicine / Critical Care', 'Multiorgan Failure', 'topic', 3),
        (3, 'Medicine / Clinical Medicine / Critical Care / ICU Monitoring', 'Medicine / Clinical Medicine / Critical Care', 'ICU Monitoring', 'topic', 4),

        (2, 'Medicine / Diagnostics / Radiology', 'Medicine / Diagnostics', 'Radiology', 'chapter', 0),
        (2, 'Medicine / Diagnostics / Laboratory Medicine', 'Medicine / Diagnostics', 'Laboratory Medicine', 'chapter', 1),
        (2, 'Medicine / Diagnostics / ECG Interpretation', 'Medicine / Diagnostics', 'ECG Interpretation', 'chapter', 2),
        (2, 'Medicine / Diagnostics / Clinical Reasoning', 'Medicine / Diagnostics', 'Clinical Reasoning', 'chapter', 3),

        (3, 'Medicine / Diagnostics / Radiology / Chest Imaging', 'Medicine / Diagnostics / Radiology', 'Chest Imaging', 'topic', 0),
        (3, 'Medicine / Diagnostics / Radiology / Abdominal Imaging', 'Medicine / Diagnostics / Radiology', 'Abdominal Imaging', 'topic', 1),
        (3, 'Medicine / Diagnostics / Radiology / Neuroimaging', 'Medicine / Diagnostics / Radiology', 'Neuroimaging', 'topic', 2),
        (3, 'Medicine / Diagnostics / Radiology / Musculoskeletal Imaging', 'Medicine / Diagnostics / Radiology', 'Musculoskeletal Imaging', 'topic', 3),
        (3, 'Medicine / Diagnostics / Radiology / Ultrasound', 'Medicine / Diagnostics / Radiology', 'Ultrasound', 'topic', 4),

        (3, 'Medicine / Diagnostics / Laboratory Medicine / Hematology Testing', 'Medicine / Diagnostics / Laboratory Medicine', 'Hematology Testing', 'topic', 0),
        (3, 'Medicine / Diagnostics / Laboratory Medicine / Clinical Chemistry', 'Medicine / Diagnostics / Laboratory Medicine', 'Clinical Chemistry', 'topic', 1),
        (3, 'Medicine / Diagnostics / Laboratory Medicine / Microbiology Testing', 'Medicine / Diagnostics / Laboratory Medicine', 'Microbiology Testing', 'topic', 2),
        (3, 'Medicine / Diagnostics / Laboratory Medicine / Immunologic Testing', 'Medicine / Diagnostics / Laboratory Medicine', 'Immunologic Testing', 'topic', 3),
        (3, 'Medicine / Diagnostics / Laboratory Medicine / Molecular Diagnostics', 'Medicine / Diagnostics / Laboratory Medicine', 'Molecular Diagnostics', 'topic', 4),
        (3, 'Medicine / Diagnostics / Laboratory Medicine / Test Interpretation', 'Medicine / Diagnostics / Laboratory Medicine', 'Test Interpretation', 'topic', 5),

        (3, 'Medicine / Diagnostics / ECG Interpretation / Rate and Rhythm', 'Medicine / Diagnostics / ECG Interpretation', 'Rate and Rhythm', 'topic', 0),
        (3, 'Medicine / Diagnostics / ECG Interpretation / Axis and Intervals', 'Medicine / Diagnostics / ECG Interpretation', 'Axis and Intervals', 'topic', 1),
        (3, 'Medicine / Diagnostics / ECG Interpretation / Conduction Abnormalities', 'Medicine / Diagnostics / ECG Interpretation', 'Conduction Abnormalities', 'topic', 2),
        (3, 'Medicine / Diagnostics / ECG Interpretation / Ischemia and Infarction', 'Medicine / Diagnostics / ECG Interpretation', 'Ischemia and Infarction', 'topic', 3),
        (3, 'Medicine / Diagnostics / ECG Interpretation / Chamber Enlargement', 'Medicine / Diagnostics / ECG Interpretation', 'Chamber Enlargement', 'topic', 4),

        (3, 'Medicine / Diagnostics / Clinical Reasoning / History and Physical', 'Medicine / Diagnostics / Clinical Reasoning', 'History and Physical', 'topic', 0),
        (3, 'Medicine / Diagnostics / Clinical Reasoning / Problem Representation', 'Medicine / Diagnostics / Clinical Reasoning', 'Problem Representation', 'topic', 1),
        (3, 'Medicine / Diagnostics / Clinical Reasoning / Differential Diagnosis', 'Medicine / Diagnostics / Clinical Reasoning', 'Differential Diagnosis', 'topic', 2),
        (3, 'Medicine / Diagnostics / Clinical Reasoning / Test Selection', 'Medicine / Diagnostics / Clinical Reasoning', 'Test Selection', 'topic', 3),
        (3, 'Medicine / Diagnostics / Clinical Reasoning / Clinical Decision Making', 'Medicine / Diagnostics / Clinical Reasoning', 'Clinical Decision Making', 'topic', 4),

        (2, 'Medicine / Pharmacology / General Pharmacology', 'Medicine / Pharmacology', 'General Pharmacology', 'chapter', 0),
        (2, 'Medicine / Pharmacology / Cardiovascular Drugs', 'Medicine / Pharmacology', 'Cardiovascular Drugs', 'chapter', 1),
        (2, 'Medicine / Pharmacology / Antimicrobials', 'Medicine / Pharmacology', 'Antimicrobials', 'chapter', 2),
        (2, 'Medicine / Pharmacology / Autonomic Drugs', 'Medicine / Pharmacology', 'Autonomic Drugs', 'chapter', 3),
        (2, 'Medicine / Pharmacology / CNS Drugs', 'Medicine / Pharmacology', 'CNS Drugs', 'chapter', 4),
        (2, 'Medicine / Pharmacology / Endocrine Drugs', 'Medicine / Pharmacology', 'Endocrine Drugs', 'chapter', 5),
        (2, 'Medicine / Pharmacology / Cancer and Immune Drugs', 'Medicine / Pharmacology', 'Cancer and Immune Drugs', 'chapter', 6),

        (3, 'Medicine / Pharmacology / General Pharmacology / Pharmacokinetics', 'Medicine / Pharmacology / General Pharmacology', 'Pharmacokinetics', 'topic', 0),
        (3, 'Medicine / Pharmacology / General Pharmacology / Pharmacodynamics', 'Medicine / Pharmacology / General Pharmacology', 'Pharmacodynamics', 'topic', 1),
        (3, 'Medicine / Pharmacology / General Pharmacology / Drug Metabolism', 'Medicine / Pharmacology / General Pharmacology', 'Drug Metabolism', 'topic', 2),
        (3, 'Medicine / Pharmacology / General Pharmacology / Adverse Drug Reactions', 'Medicine / Pharmacology / General Pharmacology', 'Adverse Drug Reactions', 'topic', 3),
        (3, 'Medicine / Pharmacology / General Pharmacology / Drug Interactions', 'Medicine / Pharmacology / General Pharmacology', 'Drug Interactions', 'topic', 4),

        (3, 'Medicine / Pharmacology / Cardiovascular Drugs / Antihypertensives', 'Medicine / Pharmacology / Cardiovascular Drugs', 'Antihypertensives', 'topic', 0),
        (3, 'Medicine / Pharmacology / Cardiovascular Drugs / Heart Failure Drugs', 'Medicine / Pharmacology / Cardiovascular Drugs', 'Heart Failure Drugs', 'topic', 1),
        (3, 'Medicine / Pharmacology / Cardiovascular Drugs / Antiarrhythmics', 'Medicine / Pharmacology / Cardiovascular Drugs', 'Antiarrhythmics', 'topic', 2),
        (3, 'Medicine / Pharmacology / Cardiovascular Drugs / Antianginal Drugs', 'Medicine / Pharmacology / Cardiovascular Drugs', 'Antianginal Drugs', 'topic', 3),
        (3, 'Medicine / Pharmacology / Cardiovascular Drugs / Anticoagulants and Antiplatelets', 'Medicine / Pharmacology / Cardiovascular Drugs', 'Anticoagulants and Antiplatelets', 'topic', 4),

        (3, 'Medicine / Pharmacology / Antimicrobials / Antibacterial Drugs', 'Medicine / Pharmacology / Antimicrobials', 'Antibacterial Drugs', 'topic', 0),
        (3, 'Medicine / Pharmacology / Antimicrobials / Antiviral Drugs', 'Medicine / Pharmacology / Antimicrobials', 'Antiviral Drugs', 'topic', 1),
        (3, 'Medicine / Pharmacology / Antimicrobials / Antifungal Drugs', 'Medicine / Pharmacology / Antimicrobials', 'Antifungal Drugs', 'topic', 2),
        (3, 'Medicine / Pharmacology / Antimicrobials / Antiparasitic Drugs', 'Medicine / Pharmacology / Antimicrobials', 'Antiparasitic Drugs', 'topic', 3),
        (3, 'Medicine / Pharmacology / Antimicrobials / Antimicrobial Resistance', 'Medicine / Pharmacology / Antimicrobials', 'Antimicrobial Resistance', 'topic', 4),

        (3, 'Medicine / Pharmacology / Autonomic Drugs / Cholinergic Agonists', 'Medicine / Pharmacology / Autonomic Drugs', 'Cholinergic Agonists', 'topic', 0),
        (3, 'Medicine / Pharmacology / Autonomic Drugs / Cholinergic Antagonists', 'Medicine / Pharmacology / Autonomic Drugs', 'Cholinergic Antagonists', 'topic', 1),
        (3, 'Medicine / Pharmacology / Autonomic Drugs / Adrenergic Agonists', 'Medicine / Pharmacology / Autonomic Drugs', 'Adrenergic Agonists', 'topic', 2),
        (3, 'Medicine / Pharmacology / Autonomic Drugs / Adrenergic Antagonists', 'Medicine / Pharmacology / Autonomic Drugs', 'Adrenergic Antagonists', 'topic', 3),
        (3, 'Medicine / Pharmacology / Autonomic Drugs / Neuromuscular Blockers', 'Medicine / Pharmacology / Autonomic Drugs', 'Neuromuscular Blockers', 'topic', 4),

        (3, 'Medicine / Pharmacology / CNS Drugs / Sedatives and Anxiolytics', 'Medicine / Pharmacology / CNS Drugs', 'Sedatives and Anxiolytics', 'topic', 0),
        (3, 'Medicine / Pharmacology / CNS Drugs / Antidepressants', 'Medicine / Pharmacology / CNS Drugs', 'Antidepressants', 'topic', 1),
        (3, 'Medicine / Pharmacology / CNS Drugs / Antipsychotics', 'Medicine / Pharmacology / CNS Drugs', 'Antipsychotics', 'topic', 2),
        (3, 'Medicine / Pharmacology / CNS Drugs / Antiseizure Drugs', 'Medicine / Pharmacology / CNS Drugs', 'Antiseizure Drugs', 'topic', 3),
        (3, 'Medicine / Pharmacology / CNS Drugs / Analgesics', 'Medicine / Pharmacology / CNS Drugs', 'Analgesics', 'topic', 4),

        (3, 'Medicine / Pharmacology / Endocrine Drugs / Diabetes Drugs', 'Medicine / Pharmacology / Endocrine Drugs', 'Diabetes Drugs', 'topic', 0),
        (3, 'Medicine / Pharmacology / Endocrine Drugs / Thyroid Drugs', 'Medicine / Pharmacology / Endocrine Drugs', 'Thyroid Drugs', 'topic', 1),
        (3, 'Medicine / Pharmacology / Endocrine Drugs / Corticosteroids', 'Medicine / Pharmacology / Endocrine Drugs', 'Corticosteroids', 'topic', 2),
        (3, 'Medicine / Pharmacology / Endocrine Drugs / Reproductive Hormones', 'Medicine / Pharmacology / Endocrine Drugs', 'Reproductive Hormones', 'topic', 3),
        (3, 'Medicine / Pharmacology / Endocrine Drugs / Bone Metabolism Drugs', 'Medicine / Pharmacology / Endocrine Drugs', 'Bone Metabolism Drugs', 'topic', 4),

        (3, 'Medicine / Pharmacology / Cancer and Immune Drugs / Cytotoxic Chemotherapy', 'Medicine / Pharmacology / Cancer and Immune Drugs', 'Cytotoxic Chemotherapy', 'topic', 0),
        (3, 'Medicine / Pharmacology / Cancer and Immune Drugs / Targeted Cancer Therapy', 'Medicine / Pharmacology / Cancer and Immune Drugs', 'Targeted Cancer Therapy', 'topic', 1),
        (3, 'Medicine / Pharmacology / Cancer and Immune Drugs / Immunotherapy', 'Medicine / Pharmacology / Cancer and Immune Drugs', 'Immunotherapy', 'topic', 2),
        (3, 'Medicine / Pharmacology / Cancer and Immune Drugs / Immunosuppressants', 'Medicine / Pharmacology / Cancer and Immune Drugs', 'Immunosuppressants', 'topic', 3),
        (3, 'Medicine / Pharmacology / Cancer and Immune Drugs / Supportive Oncology Drugs', 'Medicine / Pharmacology / Cancer and Immune Drugs', 'Supportive Oncology Drugs', 'topic', 4),

        (2, 'Medicine / USMLE Review / Step 1', 'Medicine / USMLE Review', 'Step 1', 'chapter', 0),
        (2, 'Medicine / USMLE Review / Step 2 CK', 'Medicine / USMLE Review', 'Step 2 CK', 'chapter', 1),
        (2, 'Medicine / USMLE Review / Step 3', 'Medicine / USMLE Review', 'Step 3', 'chapter', 2),

        (3, 'Medicine / USMLE Review / Step 1 / Foundational Science Review', 'Medicine / USMLE Review / Step 1', 'Foundational Science Review', 'topic', 0),
        (3, 'Medicine / USMLE Review / Step 1 / Organ Systems Review', 'Medicine / USMLE Review / Step 1', 'Organ Systems Review', 'topic', 1),
        (3, 'Medicine / USMLE Review / Step 1 / Pharmacology', 'Medicine / USMLE Review / Step 1', 'Pharmacology', 'topic', 2),
        (3, 'Medicine / USMLE Review / Step 1 / Microbiology and Immunology', 'Medicine / USMLE Review / Step 1', 'Microbiology and Immunology', 'topic', 3),
        (3, 'Medicine / USMLE Review / Step 1 / Biostatistics and Ethics', 'Medicine / USMLE Review / Step 1', 'Biostatistics and Ethics', 'topic', 4),

        (3, 'Medicine / USMLE Review / Step 2 CK / Internal Medicine Review', 'Medicine / USMLE Review / Step 2 CK', 'Internal Medicine Review', 'topic', 0),
        (3, 'Medicine / USMLE Review / Step 2 CK / Surgery Review', 'Medicine / USMLE Review / Step 2 CK', 'Surgery Review', 'topic', 1),
        (3, 'Medicine / USMLE Review / Step 2 CK / Pediatrics Review', 'Medicine / USMLE Review / Step 2 CK', 'Pediatrics Review', 'topic', 2),
        (3, 'Medicine / USMLE Review / Step 2 CK / OB-GYN Review', 'Medicine / USMLE Review / Step 2 CK', 'OB-GYN Review', 'topic', 3),
        (3, 'Medicine / USMLE Review / Step 2 CK / Psychiatry Review', 'Medicine / USMLE Review / Step 2 CK', 'Psychiatry Review', 'topic', 4),

        (3, 'Medicine / USMLE Review / Step 3 / Advanced Clinical Management', 'Medicine / USMLE Review / Step 3', 'Advanced Clinical Management', 'topic', 0),
        (3, 'Medicine / USMLE Review / Step 3 / Emergency Care Review', 'Medicine / USMLE Review / Step 3', 'Emergency Care Review', 'topic', 1),
        (3, 'Medicine / USMLE Review / Step 3 / Ambulatory Care Review', 'Medicine / USMLE Review / Step 3', 'Ambulatory Care Review', 'topic', 2),
        (3, 'Medicine / USMLE Review / Step 3 / Preventive Care Review', 'Medicine / USMLE Review / Step 3', 'Preventive Care Review', 'topic', 3),
        (3, 'Medicine / USMLE Review / Step 3 / Clinical Case Simulations', 'Medicine / USMLE Review / Step 3', 'Clinical Case Simulations', 'topic', 4)
    ) as desired(depth, path, parent_path, name, node_type, sort_order)
    order by depth, sort_order, path
  loop
    parent_node_id := case
      when node_record.parent_path is null then null
      else (node_ids ->> node_record.parent_path)::uuid
    end;

    if node_record.parent_path is not null and parent_node_id is null then
      raise exception 'Medicine taxonomy parent was not resolved: %',
        node_record.parent_path;
    end if;

    current_node_id := null;

    select ln.id
    into current_node_id
    from public.library_nodes ln
    where ln.parent_id is not distinct from parent_node_id
      and lower(ln.name) = lower(node_record.name)
    order by ln.created_at, ln.id
    limit 1;

    if current_node_id is null then
      insert into public.library_nodes (
        library_id,
        parent_id,
        name,
        node_type,
        sort_order
      )
      values (
        medicine_library_id,
        parent_node_id,
        node_record.name,
        node_record.node_type,
        node_record.sort_order
      )
      returning id into current_node_id;
    end if;

    if node_record.path = 'Medicine' then
      select ln.library_id
      into medicine_library_id
      from public.library_nodes ln
      where ln.id = current_node_id;
    end if;

    node_ids := jsonb_set(
      node_ids,
      array[node_record.path],
      to_jsonb(current_node_id::text),
      true
    );
  end loop;

  select count(*)
  into resolved_node_count
  from jsonb_object_keys(node_ids);

  if resolved_node_count <> 300 then
    raise exception 'Medicine taxonomy seed incomplete: expected 300 nodes, resolved %',
      resolved_node_count;
  end if;
end
$seed$;
