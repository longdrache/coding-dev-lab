"use client";

import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";

export default function Home() {
  const { isLoaded } = useAuth();
  const { user } = useUser();

  return (
    <main className="min-h-screen overflow-hidden bg-[#17211b] text-[#f5f1e8]">
      <div className="mx-auto max-w-7xl px-6 pb-7 sm:px-10 lg:px-14">
        <SignedOut>
          <nav className="flex items-center justify-between border-b border-[#f5f1e8]/20 pb-5 pt-4">
            <Link href="/" className="font-serif text-xl tracking-tight">
              coding<span className="text-[#d65a3a]">.</span>lab
            </Link>
            <div className="flex items-center gap-6 text-sm text-[#f5f1e8]/65">
              <Link href="/problem" className="transition hover:text-[#f5f1e8]">
                Problem Lab
              </Link>
              <Link href="/premium" className="transition hover:text-[#f5f1e8]">
                Premium
              </Link>
              <Link href="/vip" className="transition hover:text-[#f5f1e8]">
                Vip
              </Link>
              <div
                className="flex min-h-10 min-w-32 items-center justify-end"
                aria-busy={!isLoaded}
              >
                {!isLoaded && (
                  <div
                    aria-label="Loading account"
                    className="flex h-10 w-32 items-center justify-end gap-2"
                  >
                    <span className="h-10 w-16 animate-pulse border border-white/10 bg-white/10" />
                    <span className="h-10 w-12 animate-pulse bg-[#d65a3a]/35" />
                  </div>
                )}
                {isLoaded && (
                  <>
                    <SignedOut>
                      <div className="flex items-center gap-2">
                        <SignInButton mode="modal">
                          <button className="border border-[#f5f1e8]/30 px-3 py-2 text-[#f5f1e8] transition hover:border-[#f5f1e8]">
                            Sign in
                          </button>
                        </SignInButton>
                        <SignUpButton mode="modal">
                          <button className="bg-[#d65a3a] px-3 py-2 text-white transition hover:bg-[#ed704e]">
                            Join
                          </button>
                        </SignUpButton>
                      </div>
                    </SignedOut>
                    <SignedIn>
                      <UserButton />
                    </SignedIn>
                  </>
                )}
              </div>
            </div>
          </nav>
        </SignedOut>

        <SignedOut>
          <section className="relative grid min-h-[72vh] items-center gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative z-10 max-w-3xl">
              <p className="mb-6 text-xs font-bold uppercase tracking-[0.28em] text-[#d65a3a]">
                A quiet place to practice
              </p>
              <h1 className="max-w-3xl font-serif text-6xl leading-[0.94] tracking-tight sm:text-8xl">
                Think clearly.
                <br />
                <span className="text-[#d65a3a]">Ship code.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-[#f5f1e8]/65">
                Write, run, and refine small ideas in a focused coding
                workspace. No setup ceremony. Just an editor and a real
                execution loop.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/problem"
                  className="bg-[#d65a3a] px-6 py-4 font-bold text-white transition hover:bg-[#ed704e]"
                >
                  Open the problem lab <span aria-hidden="true">↗</span>
                </Link>
                <span className="text-sm text-[#f5f1e8]/45">
                  Python · JavaScript · C++
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:justify-self-end">
              <div className="absolute -right-5 -top-5 h-32 w-32 border border-[#d65a3a]/60" />
              <div className="relative border border-[#f5f1e8]/20 bg-[#202a24] p-5 shadow-[12px_12px_0_#d65a3a]">
                <div className="mb-8 flex items-center justify-between text-xs text-[#f5f1e8]/45">
                  <span>today / scratch.py</span>
                  <span className="text-[#d65a3a]">● ready</span>
                </div>
                <pre className="font-mono text-sm leading-8 text-[#f5f1e8]/80">
                  <span className="text-[#d65a3a]">def</span> make_progress():
                  {"\n"}
                  {"  "}idea ={" "}
                  <span className="text-[#e6bd72]">
                    &quot;start small&quot;
                  </span>
                  {"\n"}
                  {"  "}return idea{"\n\n"}
                  <span className="text-[#d65a3a]">print</span>(make_progress())
                </pre>
                <div className="mt-10 border-t border-[#f5f1e8]/10 pt-4 text-xs text-[#f5f1e8]/40">
                  execution / 0.018s
                </div>
              </div>
            </div>
          </section>
        </SignedOut>

        <SignedIn>
          <section className="-mx-6 min-h-screen bg-[#1b1b1b] px-6 pb-16 text-[#f0f0f0] sm:-mx-10 sm:px-10 lg:-mx-14 lg:px-14">
            <div className="mx-auto max-w-6xl">
              <nav className="flex items-center gap-7 border-b border-white/10 py-4 text-sm text-white/60">
                <Link
                  href="/"
                  className="text-2xl text-[#f5b900] transition hover:opacity-80"
                >
                  ◈
                </Link>
                <Link href="/problem" className="transition hover:text-white">
                  Problems
                </Link>
                <span className="hidden hover:text-white sm:inline">
                  Contest
                </span>
                <span className="hidden hover:text-white sm:inline">
                  Discuss
                </span>
                <span className="hidden hover:text-white sm:inline">
                  Interview
                </span>
                {user?.publicMetadata?.role !== "vip" && (
                  <Link
                    href="/premium"
                    className="font-medium text-[#f5b900] transition hover:brightness-125"
                  >
                    Premium
                  </Link>
                )}
                {user?.publicMetadata?.role === "vip" && (
                  <Link
                    href="/vip"
                    className="rounded border border-[#f5b900]/40 bg-[#f5b900]/10 px-2 py-0.5 text-xs font-semibold text-[#f5b900] transition hover:bg-[#f5b900]/20"
                  >
                    VIP
                  </Link>
                )}
                <div className="ml-auto flex items-center gap-4">
                  <span className="hidden text-xs text-white/40 md:inline">
                    {user?.firstName ?? "Coder"}&apos;s feed
                  </span>
                  <UserButton />
                </div>
              </nav>

              <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-6 border-b border-white/10 px-2 text-sm">
                    <span className="border-b-2 border-[#f5b900] py-4 text-white">
                      Feed
                    </span>
                    <span className="py-4 text-white/45">Following</span>
                  </div>

                  <div className="divide-y divide-white/10">
                    <article className="flex gap-4 py-7">
                      <div className="pt-1 text-2xl text-[#f5b900]">♛</div>
                      <div className="flex-1">
                        <p className="text-xs text-white/45">in 21 hours</p>
                        <p className="mt-2 text-sm">
                          Join our next Contest{" "}
                          <span className="text-[#2f9be8]">
                            Biweekly Contest 191
                          </span>
                        </p>
                      </div>
                    </article>
                    <article className="flex gap-4 py-7">
                      <div className="pt-1 text-2xl text-[#f5b900]">♛</div>
                      <div className="flex-1">
                        <p className="text-xs text-white/45">in a day</p>
                        <p className="mt-2 text-sm">
                          Join our next Contest{" "}
                          <span className="text-[#2f9be8]">
                            Weekly Contest 519
                          </span>
                        </p>
                      </div>
                    </article>
                    <article className="py-7">
                      <p className="text-xs text-white/45">25 days ago</p>
                      <p className="mt-2 text-sm">
                        <span className="text-[#2f9be8]">Coding Dev Lab</span>{" "}
                        posted{" "}
                        <span className="text-[#2f9be8]">
                          School&apos;s in.
                        </span>
                      </p>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">
                        Welcome back, {user?.firstName ?? "coder"}! Open the
                        problem lab and turn one idea into a working program.
                      </p>
                    </article>
                    <article className="py-7">
                      <p className="text-xs text-white/45">11 days ago</p>
                      <p className="mt-2 text-sm">
                        <span className="text-[#2f9be8]">Coding Dev Lab</span>{" "}
                        posted{" "}
                        <span className="text-[#2f9be8]">
                          Before Vibe Coding, Do You Frame the Problem First?
                        </span>
                      </p>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">
                        In the AI era, the advantage is knowing what to ask,
                        what to challenge, and what to trust.
                      </p>
                    </article>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="h-36 bg-linear-to-br from-[#262626] via-[#42351b] to-[#f5b900] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/60">
                      Coding Dev Lab
                    </p>
                    <p className="mt-5 max-w-37.5 text-2xl font-bold leading-none">
                      Build your next habit.
                    </p>
                  </div>
                  <div className="h-36 bg-linear-to-br from-[#32246b] to-[#a53cff] p-5">
                    <p className="text-lg font-bold">Problem Lab</p>
                    <p className="mt-3 text-sm text-white/75">
                      Practice data structures and algorithms.
                    </p>
                    <Link
                      href="/problem"
                      className="mt-4 inline-block bg-white px-3 py-2 text-xs font-bold text-[#32246b]"
                    >
                      Start solving
                    </Link>
                  </div>
                  <div className="border-t border-white/10 pt-5">
                    <p className="font-semibold">Coding Dev Lab Contest</p>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      Participate, run code, and sharpen your solutions.
                    </p>
                    <Link
                      href="/problem"
                      className="mt-4 inline-block bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
                    >
                      Join practice
                    </Link>
                  </div>
                  <div className="border-t border-white/10 pt-5">
                    <p className="font-semibold">Discuss Now</p>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      Share questions, approaches, and solutions.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </SignedIn>

        <SignedOut>
          <section className="grid gap-8 border-t border-[#f5f1e8]/20 py-10 text-sm sm:grid-cols-3">
            <div>
              <p className="mb-2 font-mono text-[#d65a3a]">01</p>
              <h2 className="mb-2 font-semibold">Start without friction</h2>
              <p className="text-[#f5f1e8]/50">
                Open a problem and begin in seconds.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-[#d65a3a]">02</p>
              <h2 className="mb-2 font-semibold">Run on demand</h2>
              <p className="text-[#f5f1e8]/50">
                Execute code against Judge0 and see the result.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-[#d65a3a]">03</p>
              <h2 className="mb-2 font-semibold">Keep learning</h2>
              <p className="text-[#f5f1e8]/50">
                Use each run to make the next idea sharper.
              </p>
            </div>
          </section>
        </SignedOut>
      </div>
    </main>
  );
}
