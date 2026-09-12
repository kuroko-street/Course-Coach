export const FILTER_KEYS = ['faculty_id','department_id','academic_year','semester','instructor_ids','tag_ids'];
export function readFilters(params) {
  return Object.fromEntries(FILTER_KEYS.map(key => [key, key.endsWith('_ids') ? params.getAll(key) : params.get(key) || '']));
}
export function patchQuery(previous, patch, resetPage = true) {
  const next = new URLSearchParams(previous);
  if (resetPage) next.delete('page');
  for (const [key, value] of Object.entries(patch)) {
    next.delete(key);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== '' && item != null) next.append(key, String(item));
    }
  }
  return next;
}
export const emptyFilters = () => Object.fromEntries(FILTER_KEYS.map(key => [key,key.endsWith('_ids') ? [] : '']));
export function filterQuery(filters) {
  return patchQuery(new URLSearchParams(), Object.fromEntries(FILTER_KEYS.map(key => [key,filters[key]]))).toString();
}
export function catalogReturnPath(value) {
  return typeof value === 'string' && /^(\/|\/dashboard)(\?[^#]*)?$/.test(value) ? value : '/';
}
export function dashboardState(params) {
  const tab = ['reviews','likes','aspects'].includes(params.get('tab')) ? params.get('tab') : 'reviews';
  const fields = ['satisfaction','recommendation','workload','content','teaching','exam'];
  const aspect = fields.includes(params.get('aspect')) ? params.get('aspect') : 'satisfaction';
  const raw = Number(params.get('min_reviews'));
  return {tab,aspect,min:Number.isFinite(raw) ? Math.max(0,Math.min(1000000,Math.floor(raw))) : 0};
}
