"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);

  return (
    <main style={{ margin: "4rem auto", maxWidth: 360, padding: "0 1rem" }}>
      <h1>オペレーターログイン</h1>
      <form action={action} style={{ display: "grid", gap: "1rem" }}>
        <label>
          メールアドレス
          <input name="email" type="email" required autoComplete="email" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          パスワード
          <input name="password" type="password" required autoComplete="current-password" style={{ display: "block", width: "100%" }} />
        </label>
        {state?.error && <p role="alert" style={{ color: "crimson" }}>{state.error}</p>}
        <button type="submit" disabled={pending}>{pending ? "ログイン中…" : "ログイン"}</button>
      </form>
    </main>
  );
}
