
-- HOA Agent Master/Sub Linking Script
-- Sources: Palm Beach County HOA Master-Sub List PDF, Gemini Research, Supabase name matching
-- Run each section separately in Supabase SQL Editor

-- STEP 1: Mark all known master HOAs
-- These are the umbrella associations

update communities set is_sub_hoa = false where canonical_name ilike '%mirasol property owners%';
update communities set is_sub_hoa = false where canonical_name ilike '%boca west master%';
update communities set is_sub_hoa = false where canonical_name ilike '%jonathan%landing%poa%' or canonical_name ilike '%jonathan%landing%property owners%';
update communities set is_sub_hoa = false where canonical_name ilike '%alton property owners%';
update communities set is_sub_hoa = false where canonical_name ilike '%arden homeowners association%';
update communities set is_sub_hoa = false where canonical_name ilike '%baywinds community association%';
update communities set is_sub_hoa = false where canonical_name ilike '%abacoa property owners%';
update communities set is_sub_hoa = false where canonical_name ilike '%pga national%poa%' or canonical_name ilike '%pga%property owners%';
update communities set is_sub_hoa = false where canonical_name ilike '%broken sound master%';
update communities set is_sub_hoa = false where canonical_name ilike '%indian spring master%';
update communities set is_sub_hoa = false where canonical_name ilike '%woodfield country club%' and canonical_name not ilike '% at %';
update communities set is_sub_hoa = false where canonical_name ilike '%polo club%boca%' and canonical_name not ilike '% at %';
update communities set is_sub_hoa = false where canonical_name ilike '%ballenisles community association%';
update communities set is_sub_hoa = false where canonical_name ilike '%ibis golf%country club%' and canonical_name not ilike '% at %';
update communities set is_sub_hoa = false where canonical_name ilike '%westlake%master%' or canonical_name ilike '%westlake residence%';
update communities set is_sub_hoa = false where canonical_name ilike '%avenir%master%';
update communities set is_sub_hoa = false where canonical_name ilike '%wycliffe%master%';
update communities set is_sub_hoa = false where canonical_name ilike '%river bridge property owners%';

-- STEP 2: Mark all sub-HOAs and link to masters

-- MIRASOL subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%mirasol property owners association%' limit 1)
where canonical_name ilike '% at mirasol%' or canonical_name ilike '%of mirasol%';

-- BOCA WEST subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%boca west master association%' limit 1)
where canonical_name ilike '% at boca west%' or canonical_name ilike '%of boca west%' or canonical_name ilike '% boca west %';

-- JONATHAN'S LANDING subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%jonathan%landing%' and (canonical_name ilike '%poa%' or canonical_name ilike '%property owners%') limit 1)
where canonical_name ilike '%jonathan%landing%' and canonical_name not ilike '%poa%' and canonical_name not ilike '%property owners%';

-- ALTON subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%alton property owners association%' limit 1)
where canonical_name ilike '%alton neighborhood%';

-- ARDEN subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%arden homeowners association%' limit 1)
where canonical_name ilike '%arden pud%';

-- BAYWINDS subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%baywinds community association%' limit 1)
where (canonical_name ilike '%at baywinds%' or canonical_name ilike '%of baywinds%' or canonical_name ilike '%baywinds pod%' or canonical_name ilike '%baywinds pl%')
and canonical_name not ilike '%baywinds community association%';

-- ABACOA subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%abacoa property owners%' limit 1)
where canonical_name ilike '%abacoa%' and canonical_name not ilike '%abacoa property owners%';

-- IBIS subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%ibis golf%country club%' and canonical_name not ilike '% at %' limit 1)
where canonical_name ilike '% at ibis%' or canonical_name ilike '%ibis golf%country club pl%' or canonical_name ilike '%ibis golf%country club%' and canonical_name not ilike '%ibis golf%country club homeowners%';

-- WYCLIFFE subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%wycliffe%master%' limit 1)
where canonical_name ilike '% at wycliffe%' or canonical_name ilike '%of wycliffe%';

-- AVENIR subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%avenir%master%' or (canonical_name ilike '%avenir%' and canonical_name not ilike '%pod%' and canonical_name not ilike '%parcel%' and canonical_name not ilike '%site plan%') limit 1)
where canonical_name ilike '%avenir%' and (canonical_name ilike '%pod%' or canonical_name ilike '%parcel%' or canonical_name ilike '%site plan%' or canonical_name ilike '% at avenir%');

-- BROKEN SOUND subs  
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%broken sound master%' limit 1)
where canonical_name ilike '%broken sound%' and canonical_name not ilike '%broken sound master%';

-- INDIAN SPRING subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%indian spring master%' limit 1)
where canonical_name ilike '%indian spring%' and canonical_name not ilike '%indian spring master%';

-- POLO CLUB subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%polo club%boca%' and canonical_name not ilike '% at %' limit 1)
where canonical_name ilike '% at polo club%' or canonical_name ilike '%polo club%' and canonical_name ilike '% at %';

-- WOODFIELD subs
update communities 
set is_sub_hoa = true, master_hoa_id = (select id from communities where canonical_name ilike '%woodfield country club%' and canonical_name not ilike '% at %' limit 1)
where canonical_name ilike '% at woodfield%' or canonical_name ilike '%woodfield%' and canonical_name ilike '% at %';

-- STEP 3: Verify counts
select 
  (select canonical_name from communities where id = master_hoa_id limit 1) as master_hoa,
  count(*) as sub_count
from communities 
where is_sub_hoa = true and master_hoa_id is not null
group by master_hoa_id
order by sub_count desc;
