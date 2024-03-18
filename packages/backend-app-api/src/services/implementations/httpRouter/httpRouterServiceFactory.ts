/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Handler } from 'express';
import PromiseRouter from 'express-promise-router';
import {
  coreServices,
  createServiceFactory,
  HttpRouterServiceAuthPolicy,
} from '@backstage/backend-plugin-api';
import { createCookieAuthRefreshMiddleware } from '@backstage/plugin-auth-node';
import { createLifecycleMiddleware } from './createLifecycleMiddleware';
import { createCredentialsBarrier } from './createCredentialsBarrier';
import { createAuthIntegrationRouter } from './createAuthIntegrationRouter';

/**
 * @public
 */
export interface HttpRouterFactoryOptions {
  /**
   * A callback used to generate the path for each plugin, defaults to `/api/{pluginId}`.
   */
  getPath?(pluginId: string): string;
}

/** @public */
export const httpRouterServiceFactory = createServiceFactory(
  (options?: HttpRouterFactoryOptions) => ({
    service: coreServices.httpRouter,
    initialization: 'always',
    deps: {
      plugin: coreServices.pluginMetadata,
      config: coreServices.rootConfig,
      lifecycle: coreServices.lifecycle,
      rootHttpRouter: coreServices.rootHttpRouter,
      auth: coreServices.auth,
      httpAuth: coreServices.httpAuth,
    },
    async factory({
      auth,
      httpAuth,
      config,
      plugin,
      rootHttpRouter,
      lifecycle,
    }) {
      const getPath = options?.getPath ?? (id => `/api/${id}`);
      const path = getPath(plugin.getId());

      const router = PromiseRouter();
      rootHttpRouter.use(path, router);

      const credentialsBarrier = createCredentialsBarrier({
        httpAuth,
        config,
      });

      router.use(createLifecycleMiddleware({ lifecycle }));
      router.use(createAuthIntegrationRouter({ auth }));
      router.use(credentialsBarrier.middleware);

      return {
        use(handler: Handler): void {
          router.use(handler);
        },
        addAuthPolicy(policy: HttpRouterServiceAuthPolicy): void {
          credentialsBarrier.addAuthPolicy(policy);
          if (policy.allow === 'user-cookie') {
            // TODO: Make sure this is only added once
            router.use(createCookieAuthRefreshMiddleware({ httpAuth }));
          }
        },
      };
    },
  }),
);
