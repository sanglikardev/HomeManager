-- Several dishes per meal, each with an optional quantity ("12 rotis", "1 bowl").
alter table hm_meals add column if not exists qty text not null default '';
