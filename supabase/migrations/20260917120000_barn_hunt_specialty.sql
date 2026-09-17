-- Barn Hunt is a trainer-selectable specialty and a public search filter.
-- Keep related disciplines together in the canonical enum/UI order.
-- Apply this migration before deploying the app that offers the new value.
alter type public.trainer_specialty add value 'barn_hunt' after 'scent_work';
