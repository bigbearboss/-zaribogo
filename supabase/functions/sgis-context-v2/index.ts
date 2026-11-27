import { createPopulationHandler } from './handler.ts';

Deno.serve(createPopulationHandler({ env: name => Deno.env.get(name), fetch }));
