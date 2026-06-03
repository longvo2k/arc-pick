import { conservative } from "./conservative.js";
import { aggressive } from "./aggressive.js";
import { modelBased } from "./model-based.js";

export { conservative, aggressive, modelBased };
export const Strategies = { conservative, aggressive, modelBased } as const;
