// Gọi API cùng domain qua BFF proxy (app/api/[...path]) để cookie
// admin_token thuộc domain admin. Không gọi thẳng BE cross-site nữa.
export async function adminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}
