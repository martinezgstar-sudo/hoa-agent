const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

(async () => {
  // 1) 2701 PGA Boulevard Condominium — legal_name + zip still polluted
  await status.flagReview(
    'mission-goal',
    'high',
    '2701 PGA Boulevard Condominium: bad legal_name + zip from rejected Sunbiz doc',
    'Community df04724d-4629-4d37-8d40-d2e7d0325044 still carries legal_name="MASTIQUE I 12701 MASTIQUE BEACH BOULEVARD UNIT 1604 LLC" and zip_code="33907" (Fort Myers). The PBG mgmt backfill nulled state_entity_number from BAD doc L17000095987 but left the downstream pollution. zip 33907 is wrong (PBG is 33408/33410/33418/33420). Suggested action: SET legal_name=NULL, entity_status=NULL, zip_code=NULL, city_verified=false; then re-research via scripts/research-hoa-comprehensive.py with --slug=2701-pga-boulevard-condominium.',
    {
      community_id: 'df04724d-4629-4d37-8d40-d2e7d0325044',
      pending_id: 'f53ed4ae-9ae4-4728-8572-235f7efc808f',
      polluted_fields: { legal_name: 'MASTIQUE I 12701 MASTIQUE BEACH BOULEVARD UNIT 1604 LLC', zip_code: '33907', entity_status: 'Inactive' },
      bad_doc: 'L17000095987'
    }
  );

  // 2) Abacoa Plaza POA — legal_name, incorporation_date, entity_status from a different bad match
  await status.flagReview(
    'mission-goal',
    'high',
    'Abacoa Plaza POA: legal_name points to developer LLLP, not the POA',
    'Community 03701790-feda-4556-a678-4b18003abb9c has legal_name="SC-ABACOA PLAZA ASSOCIATES, LLLP" (a developer entity, not the POA). incorporation_date=2001-10-25 and entity_status=Active also likely come from that wrong match. zip_code=33401 (WPB) is also suspect — Abacoa is in Jupiter (33458). The flag pending row references BAD doc A01000001452 ("RT PLAZA POA") but the legal_name on the row is yet another wrong entity, so a prior bad write was never cleaned. master_hoa_id=56d3f0de... is_sub_hoa=true — DO NOT auto-unlink (rule #17). Suggested action: null legal_name + incorporation_date + entity_status, fix zip to 33458, re-research, leave master_hoa_id alone.',
    {
      community_id: '03701790-feda-4556-a678-4b18003abb9c',
      pending_id: '5c0831a6-e881-4c12-bd77-7aa5c4f8369f',
      polluted_fields: { legal_name: 'SC-ABACOA PLAZA ASSOCIATES, LLLP', incorporation_date: '2001-10-25', entity_status: 'Active', zip_code: '33401' },
      bad_doc: 'A01000001452',
      master_hoa_id: '56d3f0de-ee64-43a5-999d-29392b6c9532'
    }
  );

  // 3) A Place In The Woods POA Inc (e4fb4cc4) — bad legal_name + duplicate
  await status.flagReview(
    'mission-goal',
    'high',
    'A Place In The Woods POA Inc: bad legal_name + likely duplicate of fe0c1310',
    'Community e4fb4cc4-a0fc-4c35-b19a-4ba7e218e557 has legal_name="PARK PLACE AT MEADOW WOODS HOMEOWNERS ASSOCIATION, INC." (an Orlando/Orange County HOA) and incorporation_date=1990-12-27 / entity_status=Active from that wrong match. Pending flag references BAD doc N41430 → RANGELINE WOODS POA — yet another mismatch. ALSO: there is a near-duplicate row fe0c1310-17ae-4000-ab19-83c42bd213d6 ("A Place In The Woods Property Owners Associationinc.") in zip 33418 that has the CORRECT Sunbiz entity (745245, "A PLACE IN THE WOODS POA INC.", inc. 1978-12-13). Recommended path: keep fe0c1310 (real Sunbiz match), mark e4fb4cc4 status=duplicate after verifying both are the same community via dedupe-check, OR transfer Sunbiz fields from fe0c1310 to e4fb4cc4 and dedupe the other direction. Do not auto-merge — admin review required.',
    {
      community_ids: { flagged: 'e4fb4cc4-a0fc-4c35-b19a-4ba7e218e557', possible_duplicate: 'fe0c1310-17ae-4000-ab19-83c42bd213d6' },
      pending_id: 'e9a928dd-0c94-4162-b3fb-7ff42161741e',
      polluted_fields: { legal_name: "PARK PLACE AT MEADOW WOODS HOMEOWNERS' ASSOCIATION, INC.", incorporation_date: '1990-12-27', entity_status: 'Active' },
      bad_doc: 'N41430'
    }
  );

  // 4) Frenchmans Creek HOA — appears clean, but verify registered_agent
  await status.flagReview(
    'mission-goal',
    'low',
    'Frenchmans Creek HOA: appears clean post-flag, verify registered_agent only',
    "Community b4c4725e-2d6b-49f2-92e9-8d06a8116afb has legal_name=Frenchman's Creek Property Owners Association Inc (correct), entity_status=Active, registered_agent=Joseph L. Hanson. State_entity_number was nulled by the PBG backfill (BAD doc N36299 -> FRENCHMAN'S CREEK LTD was rejected -- that doc is the country club developer entity, not the POA). Suggested action: spot-check registered_agent Joseph L. Hanson against current Sunbiz POA record before considering this row complete. No urgent cleanup needed.",
    {
      community_id: 'b4c4725e-2d6b-49f2-92e9-8d06a8116afb',
      pending_id: '5d954aeb-4bef-43a1-b692-25bb91441da3',
      current_state: { legal_name: "Frenchman's Creek Property Owners Association, Inc.", registered_agent: 'Joseph L. Hanson', entity_status: 'Active' },
      bad_doc: 'N36299'
    }
  );

  console.log('Flagged 4 review items.');
  process.exit(0);
})();
