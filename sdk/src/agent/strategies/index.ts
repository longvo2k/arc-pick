import { conservative } from "./conservative.js";
import { aggressive } from "./aggressive.js";

export { conservative, aggressive };
export const Strategies = { conservative, aggressive } as const;
