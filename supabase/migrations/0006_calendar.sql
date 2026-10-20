-- Month calendar entries reuse hm_plans: add a time of day and a 'holiday' kind.
alter table hm_plans add column if not exists time text not null default '';
alter table hm_plans drop constraint if exists hm_plans_kind_check;
alter table hm_plans add constraint hm_plans_kind_check check (kind in ('trip', 'event', 'other', 'holiday'));
