import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { reportError } = await import("./lib/monitoring");
  reportError(err, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
