import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function isUnauthenticated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNAUTHENTICATED");
}

export const getRouter = () => {
  // eslint-disable-next-line prefer-const
  let router: ReturnType<typeof createRouter>;

  // Session expired or missing: drop the local flag and send the user to sign in
  // instead of letting the error crash the page.
  const handleError = (error: unknown) => {
    if (!isUnauthenticated(error) || typeof window === "undefined") return;
    localStorage.removeItem("forge_auth");
    if (window.location.pathname !== "/login") void router.navigate({ to: "/login" });
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        retry: (count, error) => !isUnauthenticated(error) && count < 2,
        throwOnError: false,
      },
    },
  });

  router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
