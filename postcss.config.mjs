/** Empty on purpose. A stray postcss.config.mjs at C:\dev (belonging to an
 *  unrelated project) requires tailwindcss; without this local file Next walks
 *  up and inherits it. GreenLight ships plain CSS and needs no plugins. */
export default { plugins: {} };
