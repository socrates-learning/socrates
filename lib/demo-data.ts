export const demoConcepts = [
  { id:'ace-inhibitors', name:'ACE Inhibitors', type:'Drug Class', importance:'High', difficulty:'Intermediate', estimated_time:'15 min', summary:'ACE inhibitors lower blood pressure by reducing angiotensin II formation. This reduces vasoconstriction, lowers aldosterone effects, and can decrease cardiac workload.', why_it_matters:'This concept connects pharmacology with RAAS physiology, hypertension, heart failure, kidney protection, potassium balance, and medication safety.'},
  { id:'arbs', name:'ARBs', type:'Drug Class', importance:'High', difficulty:'Intermediate', estimated_time:'12 min', summary:'ARBs block angiotensin II receptors and are often used when ACE inhibitors cause cough.', why_it_matters:'ARBs are commonly compared with ACE inhibitors and are important for hypertension and heart failure.'},
  { id:'raas', name:'Renin-Angiotensin-Aldosterone System', type:'Physiology System', importance:'High', difficulty:'Intermediate', estimated_time:'20 min', summary:'RAAS helps regulate blood pressure, sodium balance, potassium balance, and fluid volume.', why_it_matters:'Many cardiovascular and renal drugs act through this system.'},
  { id:'hyperkalemia', name:'Hyperkalemia', type:'Electrolyte Problem', importance:'High', difficulty:'Intermediate', estimated_time:'12 min', summary:'Hyperkalemia is elevated potassium, which can affect cardiac conduction and become dangerous.', why_it_matters:'Many drugs affect potassium balance, including ACE inhibitors, ARBs, and potassium-sparing diuretics.'}
];

export const demoObjects = [
  { id:'q1', concept_id:'ace-inhibitors', object_type:'flashcard', prompt:'What enzyme is inhibited by ACE inhibitors?', answer:'Angiotensin-converting enzyme.', submastery_area:'Mechanism'},
  { id:'q2', concept_id:'ace-inhibitors', object_type:'flashcard', prompt:'Why can ACE inhibitors cause hyperkalemia?', answer:'Reduced aldosterone effect can decrease potassium excretion, causing potassium retention.', submastery_area:'Adverse Effects'},
  { id:'q3', concept_id:'ace-inhibitors', object_type:'distinction', prompt:'ACE inhibitors vs ARBs: what is the key difference?', answer:'ACE inhibitors reduce angiotensin II formation and increase bradykinin, while ARBs block angiotensin II receptors and usually do not cause cough.', submastery_area:'Distinctions'}
];
