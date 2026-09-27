/** PostgreSQL COLLATE "C": UTF-8 byte order, independent of browser locale. */
export function compareTopicText(/** @type {string} */ left, /** @type {string} */ right) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
/** @param {{sort_order:number|null,name:string,id:string}} a @param {{sort_order:number|null,name:string,id:string}} b */
export function compareCreatorTopics(a, b) {
  const left = a.sort_order ?? Infinity, right = b.sort_order ?? Infinity;
  return (left === right ? 0 : left - right) || compareTopicText(a.name, b.name) || compareTopicText(a.id, b.id);
}
