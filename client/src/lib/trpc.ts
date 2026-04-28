import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/src/routers/index";

export const trpc = createTRPCReact<AppRouter>();
