import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  traceId: string;
};

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run: (context: RequestContext, callback: () => void) => {
    asyncLocalStorage.run(context, callback);
  },
  getTraceId: () => {
    return asyncLocalStorage.getStore()?.traceId;
  },
};
