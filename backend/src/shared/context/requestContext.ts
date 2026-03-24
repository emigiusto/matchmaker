import { AsyncLocalStorage } from 'async_hooks'

interface RequestContext {
  isImpersonated: boolean
}

export const requestContext = new AsyncLocalStorage<RequestContext>()
