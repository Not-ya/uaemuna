const root = document.querySelector("#member-app");
const config = {};
let csrf = "";
async function request(action, params = {}, read = false) {
  const response = await fetch(
    "/.netlify/functions/members" +
      (read ? "?" + new URLSearchParams({ action, ...params }) : ""),
    {
      method: read ? "GET" : "POST",
      credentials: "same-origin",
      headers: read
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: read ? undefined : JSON.stringify({ action, ...params }),
    },
  );
  const result = await response
    .json()
    .catch(() => ({ error: "Member services are unavailable." }));
  if (!response.ok) {
    if (response.status === 401 && location.pathname === "/dashboard/")
      location.replace("/login/");
    throw new Error(result.error || "The request could not be completed.");
  }
  if (result.csrf) csrf = result.csrf;
  return result;
}
async function call(action, params = {}) {
  try {
    return await request(action, params);
  } catch (error) {
    return { error };
  }
}
const auth = {
  async getSession() {
    const r = await request("auth.session", {}, true);
    return { data: { session: r.user ? { user: r.user } : null } };
  },
  async getUser() {
    const r = await request("auth.session", {}, true);
    return { data: { user: r.user } };
  },
  async signInWithPassword(data) {
    return call("auth.login", data);
  },
  async signOut() {
    return call("auth.logout");
  },
};
const e = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const roles = ["member", "volunteer", "staff", "executive", "admin"];
const roleName = (role) =>
  ({
    owner: "Owner",
    admin: "Admin",
    executive: "Leadership",
    staff: "Staff",
    volunteer: "Volunteer",
    member: "Member",
  })[role] || "Member";
let session,
  profile,
  members = [],
  chats = [],
  currentChat = null,
  messages = [],
  reactions = [],
  channel,
  reply = null,
  editing = null,
  inboxPage = 1,
  inboxRows = [],
  hubView = "chats";
const name = (id) => {
  const p = members.find((p) => p.id === id);
  return p?.name || p?.email?.split("@")[0] || "Member";
};
const initials = (id) =>
  name(id)
    .split(/[ ._-]/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const time = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
const date = (value) =>
  new Date(value).toLocaleDateString([], { day: "numeric", month: "short" });
function notice(text, bad = false) {
  let node = document.querySelector("#member-notice");
  if (!node) {
    node = document.createElement("div");
    node.id = "member-notice";
    node.className = "member-notice";
    node.setAttribute("role", "status");
    document.body.append(node);
  }
  node.textContent = text;
  node.classList.toggle("is-error", bad);
  node.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (node.hidden = true), 9000);
}
function fatal(text) {
  root.innerHTML = `<section class="auth-panel"><h1>Member hub</h1><p>${e(text)}</p><a class="button" href="/login/">Back to sign in</a></section>`;
}
function options(selected = "member") {
  return roles
    .map(
      (r) =>
        `<option value="${r}" ${r === selected ? "selected" : ""}>${roleName(r)}</option>`,
    )
    .join("");
}
function authPage(mode) {
  const create = mode === "create",
    forgot = mode === "forgot",
    reset = mode === "reset",
    activate = mode === "activate",
    setPassword = reset || activate;
  root.innerHTML = `<div class="auth-layout"><aside class="auth-story"><img src="/images/uaemuna-emblem.png" alt="UAEMUNA emblem" width="92" height="92"><p class="eyebrow">THE PEOPLE BEHIND THE CONFERENCES</p><h1>${create || activate ? "Your place<br>in the team." : forgot || reset ? "Let’s get<br>you back in." : "Good to<br>see you."}</h1><p>One space for your team, your conversations, and everything happening at UAEMUNA.</p><a href="/">← Back to the website</a></aside><section class="auth-panel"><p class="eyebrow">MEMBER ACCESS</p><h2>${create ? "Invited to the team?" : forgot ? "Forgot your password?" : activate ? "Set up your account" : reset ? "Choose a new password" : "Sign in"}</h2><p>${create ? "Enter your invited email address. We’ll send a private link where you can choose your name and password." : forgot ? "We’ll email a reset link if an account exists for this address." : activate ? "Your email link proves this account belongs to you. Choose a name and a password of at least 10 characters." : reset ? "Choose a password of at least 10 characters. This will sign you out on all devices." : "Your chats, team, and updates. All here."}</p><form id="auth-form" data-mode="${mode}">${activate ? '<label>Your name<input name="name" autocomplete="name" required maxlength="80"></label>' : ""}${!setPassword ? '<label>Email address<input type="email" name="email" autocomplete="email" required maxlength="254"></label>' : ""}${mode === "login" || setPassword ? `<label>${setPassword ? "New password" : "Password"}<input type="password" name="password" autocomplete="${setPassword ? "new-password" : "current-password"}" required minlength="${setPassword ? "10" : "1"}" maxlength="128"></label>` : ""}${setPassword ? '<label>Confirm password<input type="password" name="confirm" autocomplete="new-password" required minlength="10" maxlength="128"></label>' : ""}<p id="auth-status" role="status" class="auth-status"></p><button class="button" type="submit">${create ? "Send account link" : forgot ? "Send reset link" : setPassword ? "Save password" : "Sign in"}</button></form><div class="auth-links">${mode === "login" ? '<a href="/forgot-password/">Forgot password?</a><span>Invited? <a href="/create-account/">Create an account</a></span>' : '<a href="/login/">Back to sign in</a>'}</div></section></div>`;
  document.querySelector("#auth-form").addEventListener("submit", submitAuth);
}
async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget,
    fields = new FormData(form),
    mode = form.dataset.mode,
    status = document.querySelector("#auth-status"),
    button = form.querySelector("button");
  button.disabled = true;
  status.textContent = "Just a moment…";
  try {
    const email = String(fields.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(fields.get("password") || "");
    if (
      ["activate", "reset"].includes(mode) &&
      password !== fields.get("confirm")
    )
      throw new Error("The passwords don’t match.");
    if (mode === "login") {
      await request("auth.login", { email, password });
      location.assign("/dashboard/");
      return;
    }
    if (mode === "create" || mode === "forgot") {
      const r = await request(
        mode === "create" ? "auth.request-account" : "auth.forgot",
        { email },
      );
      status.textContent = r.message;
      form.reset();
    }
    if (mode === "activate" || mode === "reset") {
      const token = new URLSearchParams(location.search).get("token");
      if (!token)
        throw new Error("Open the one-use link from your email first.");
      await request("auth.complete", {
        token,
        password,
        name: fields.get("name") || "",
      });
      history.replaceState({}, "", location.pathname);
      status.textContent =
        mode === "activate"
          ? "Your account is ready. Sign in with your new password."
          : "Password updated. Sign in with your new password.";
      form.reset();
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
async function api(path, init = {}) {
  if (path.startsWith("contact-inbox"))
    return request("contact.list", {
      page: Number(new URLSearchParams(path.split("?")[1]).get("page")) || 1,
    });
  const res = await fetch("/.netlify/functions/" + path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
  });
  if (!res.ok) throw new Error("Notification delivery is unavailable.");
  return { ok: true };
}
function chatName(c) {
  return c.kind === "direct"
    ? name(c.direct_a === profile.id ? c.direct_b : c.direct_a)
    : c.title;
}
async function loadDirectory() {
  const [people, conversations] = await Promise.all([
    call("member.list"),
    call("chat.list"),
  ]);
  if (people.error || conversations.error)
    throw new Error("Could not load the hub. Please check your connection.");
  members = people.data;
  chats = conversations.data;
}
async function loadHub() {
  root.innerHTML =
    '<div class="member-loading" role="status">Opening your hub…</div>';
  const who = await auth.getUser();
  if (who.error || !who.data.user?.email_confirmed_at) {
    await auth.signOut();
    location.replace("/login/");
    return;
  }
  session = who.data;
  const mine = { data: who.data.user };
  if (mine.error || !mine.data?.active) {
    fatal("This account is not active. Contact the owner for help.");
    return;
  }
  profile = mine.data;
  await loadDirectory();
  renderHub();
  const requested = new URLSearchParams(location.search).get("chat");
  await openChat(
    chats.find((c) => c.id === requested)?.id ||
      chats.find((c) => c.slug === "main")?.id,
  );
  subscribe();
}
function renderHub() {
  root.innerHTML = `<div class="hub"><aside class="hub-sidebar"><div class="hub-member"><span class="avatar">${e(initials(profile.id))}</span><div><strong>${e(name(profile.id))}</strong><small>${e(roleName(profile.role))}</small></div></div><nav class="hub-nav" aria-label="Member sections"><button data-view="chats" class="selected">Conversations</button>${["owner", "admin"].includes(profile.role) ? '<button data-view="inbox">Contact inbox</button>' : ""}${profile.role === "owner" ? '<button data-view="team">Team & invitations</button>' : ""}<button data-view="settings">My account</button></nav><div id="chat-list"></div><button class="new-dm" data-action="new-dm">＋ New private chat</button><button class="hub-signout" data-action="signout">Sign out</button></aside><section class="hub-main" id="hub-main" aria-label="Member workspace"></section></div><dialog id="member-dialog"><div id="dialog-content"></div><button class="dialog-close" data-action="close-dialog" aria-label="Close dialog">×</button></dialog>`;
  renderChatList();
  root.addEventListener("click", handleClick);
  root.addEventListener("submit", handleSubmit);
}
function renderChatList() {
  const target = document.querySelector("#chat-list");
  if (!target) return;
  target.innerHTML = `<p class="sidebar-label">GROUPS</p>${chats
    .filter((c) => c.kind === "group")
    .map(
      (c) =>
        `<button class="chat-item ${c.id === currentChat ? "selected" : ""}" data-chat="${c.id}"><span class="room-mark">#</span>${e(c.title)}</button>`,
    )
    .join("")}<p class="sidebar-label">PRIVATE CHATS</p>${
    chats
      .filter((c) => c.kind === "direct")
      .map(
        (c) =>
          `<button class="chat-item ${c.id === currentChat ? "selected" : ""}" data-chat="${c.id}"><span class="avatar small-avatar">${e(initials(c.direct_a === profile.id ? c.direct_b : c.direct_a))}</span>${e(chatName(c))}</button>`,
      )
      .join("") ||
    '<p class="sidebar-empty">Start a conversation with someone on the team.</p>'
  }`;
}
async function openChat(id) {
  if (!id) return;
  hubView = "chats";
  currentChat = id;
  reply = null;
  editing = null;
  messages = [];
  updateSelected();
  renderChatList();
  const c = chats.find((c) => c.id === id);
  const main = document.querySelector("#hub-main");
  main.innerHTML = `<div class="chat-header"><div><p class="eyebrow">${c.kind === "direct" ? "JUST THE TWO OF YOU" : "TEAM CONVERSATION"}</p><h1>${e(chatName(c))}</h1></div><button data-action="notifications" class="subtle-button">Enable notifications</button></div><div class="message-history" id="message-history" aria-label="Messages"><p class="empty-state">Loading messages…</p></div><div class="compose-context" id="compose-context" hidden></div><form id="compose-form" class="compose-form"><label class="sr-only" for="message-input">Message</label><textarea id="message-input" name="message" rows="1" maxlength="4000" required placeholder="Write a message…"></textarea><button class="send-button" type="submit" aria-label="Send message">Send ↑</button></form><p class="compose-hint">Enter to send · Shift + Enter for a new line</p>`;
  document.querySelector("#message-input").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      document.querySelector("#compose-form").requestSubmit();
    }
  });
  await refreshMessages(true);
  updateNotificationButton();
}
function updateSelected() {
  document
    .querySelectorAll("[data-view]")
    .forEach((n) => n.classList.toggle("selected", n.dataset.view === hubView));
}
async function refreshMessages(scroll = false) {
  if (hubView !== "chats" || !currentChat) return;
  const id = currentChat;
  const r = await call("message.list", { chat: id });
  if (r.error) {
    notice("Could not load messages. Please try again.", true);
    return;
  }
  if (id !== currentChat || hubView !== "chats") return;
  const latest = r.data.reverse();
  const latestIds = new Set(latest.map((m) => m.id));
  const older = messages.length > 80
    ? messages.filter((m) => !latestIds.has(m.id))
    : [];
  messages = [...older, ...latest];
  const rr = messages.length
    ? await call("reaction.list", { chat: id })
    : { data: [] };
  if (rr.error) {
    notice("Could not load reactions.", true);
    return;
  }
  if (id !== currentChat || hubView !== "chats") return;
  reactions = rr.data;
  renderMessages(scroll);
}
function renderMessages(scroll = false) {
  const target = document.querySelector("#message-history");
  if (!target) return;
  const nearBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 100,
    position = target.scrollTop;
  let lastDay = "";
  target.innerHTML = `${messages.length >= 80 ? '<button class="older-messages" data-action="older">Load earlier messages</button>' : ""}${
    messages.length
      ? messages
          .map((m) => {
            const day = date(m.created_at),
              separator =
                day === lastDay
                  ? ""
                  : `<div class="day-separator">${e(day)}</div>`;
            lastDay = day;
            const own = m.author_id === profile.id;
            const parent = messages.find((p) => p.id === m.reply_to);
            const grouped = {};
            for (const r of reactions.filter((r) => r.message_id === m.id))
              (grouped[r.emoji] ??= []).push(r.user_id);
            return `${separator}<article class="message ${own ? "own" : ""}" data-message="${m.id}"><span class="avatar message-avatar">${e(initials(m.author_id))}</span><div class="message-content"><div class="message-meta"><strong>${e(name(m.author_id))}</strong><time datetime="${m.created_at}">${e(time(m.created_at))}${m.edited_at ? " · edited" : ""}</time></div>${m.reply_to ? `<div class="quoted-message">${parent ? `${e(name(parent.author_id))}: ${e(parent.body.slice(0, 100))}` : "Reply to an earlier message"}</div>` : ""}<div class="message-bubble">${e(m.body)}</div><div class="message-reactions">${Object.entries(
              grouped,
            )
              .map(
                ([emoji, ids]) =>
                  `<button class="reaction ${ids.includes(profile.id) ? "reacted" : ""}" data-react="${emoji}" data-id="${m.id}" aria-label="${emoji} reaction, ${ids.length} members" aria-pressed="${ids.includes(profile.id)}">${emoji} ${ids.length}</button>`,
              )
              .join(
                "",
              )}</div><div class="message-tools"><button data-action="react" data-id="${m.id}">React</button><button data-action="reply" data-id="${m.id}">Reply</button>${own ? `<button data-action="edit" data-id="${m.id}">Edit</button>` : ""}${own || ["owner", "admin"].includes(profile.role) ? `<button data-action="delete" data-id="${m.id}">Delete</button>` : ""}</div></div></article>`;
          })
          .join("")
      : '<div class="empty-state"><span class="empty-wave">✌</span><h2>Start the conversation.</h2><p>This is your space. Say hello.</p></div>'
  }`;
  if (scroll || nearBottom) target.scrollTop = target.scrollHeight;
  else target.scrollTop = position;
}
function subscribe() {
  let cycles = 0,
    busy = false;
  channel = setInterval(async () => {
    if (document.hidden || busy) return;
    busy = true;
    try {
      await refreshMessages();
      if (++cycles % 4 === 0) {
        await loadDirectory();
        renderChatList();
      }
    } catch {
      notice("Connection interrupted. We’ll keep trying.", true);
    } finally {
      busy = false;
    }
  }, 4000);
  window.addEventListener("pagehide", () => clearInterval(channel), {
    once: true,
  });
}
async function sendMessage(form) {
  const input = form.querySelector("textarea"),
    body = input.value.trim();
  if (!body) return;
  form.querySelector("button").disabled = true;
  try {
    let r;
    if (editing) r = await call("message.edit", { id: editing, body });
    else
      r = await call("message.send", {
        chat: currentChat,
        body,
        replyTo: reply?.id || null,
      });
    if (r.error)
      throw new Error(
        "Message not sent. Check your connection, or wait a second and try again.",
      );
    const wasEdit = !!editing;
    input.value = "";
    reply = null;
    editing = null;
    setComposeContext();
    await refreshMessages(true);
    if (!wasEdit && config.pushConfigured)
      api("push-message-background", {
        method: "POST",
        body: JSON.stringify({ messageId: r.data.id }),
      }).catch(() =>
        notice(
          "Message sent. Notification delivery is temporarily unavailable.",
        ),
      );
  } catch (error) {
    notice(error.message, true);
  } finally {
    form.querySelector("button").disabled = false;
    input.focus();
  }
}
function setComposeContext() {
  const target = document.querySelector("#compose-context");
  if (!target) return;
  target.hidden = !reply && !editing;
  target.innerHTML = `<span>${editing ? "Editing your message" : reply ? `Replying to ${e(name(reply.author_id))}` : ""}</span><button data-action="cancel-compose" aria-label="Cancel reply or edit">×</button>`;
}
function dialog(html) {
  document.querySelector("#dialog-content").innerHTML = html;
  document.querySelector("#member-dialog").showModal();
}
function closeDialog() {
  document.querySelector("#member-dialog").close();
}
function showNewDm() {
  dialog(
    `<h2>New private chat</h2><p>Choose someone from the team.</p><label>Find a member<input id="member-search" type="search" placeholder="Search names or emails"></label><div id="member-search-results" class="member-search-results"></div>`,
  );
  const render = () => {
    const q = document.querySelector("#member-search").value.toLowerCase();
    document.querySelector("#member-search-results").innerHTML =
      members
        .filter(
          (p) =>
            p.id !== profile.id &&
            p.active &&
            (p.name + " " + p.email).toLowerCase().includes(q),
        )
        .map(
          (p) =>
            `<button data-direct="${p.id}"><span class="avatar">${e(initials(p.id))}</span><span><strong>${e(name(p.id))}</strong><small>${e(roleName(p.role))}</small></span></button>`,
        )
        .join("") || "<p>No members found.</p>";
  };
  document.querySelector("#member-search").addEventListener("input", render);
  render();
}
async function handleClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  try {
    if (target.dataset.chat) {
      await openChat(target.dataset.chat);
      return;
    }
    if (target.dataset.view) {
      hubView = target.dataset.view;
      updateSelected();
      if (hubView === "chats") await openChat(currentChat);
      if (hubView === "inbox") {
        inboxRows = [];
        await showInbox(1);
      }
      if (hubView === "team") await showTeam();
      if (hubView === "settings") showSettings();
      return;
    }
    if (target.dataset.direct) {
      target.disabled = true;
      const r = await call("chat.direct", { other: target.dataset.direct });
      if (r.error) throw new Error("Could not open this conversation.");
      await loadDirectory();
      closeDialog();
      await openChat(r.data);
      return;
    }
    if (target.dataset.react) {
      const emoji = target.dataset.react,
        id = target.dataset.id;
      const r = await call("reaction.toggle", { id, emoji });
      if (r.error) throw new Error("Could not update that reaction.");
      if (document.querySelector("#member-dialog").open) closeDialog();
      await refreshMessages();
      return;
    }
    const action = target.dataset.action,
      id = target.dataset.id,
      m = messages.find((m) => m.id === id);
    if (action === "signout") {
      const r = await auth.signOut();
      if (r.error) throw new Error("Could not sign out. Please try again.");
      clearInterval(channel);
      // The server deletes session subscriptions atomically. Browser cleanup is best effort.
      try {
        const registration = await navigator.serviceWorker?.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe();
      } catch {}
      location.assign("/login/");
    }
    if (action === "new-dm") showNewDm();
    if (action === "close-dialog") closeDialog();
    if (action === "react")
      dialog(
        `<h2>React to message</h2><div class="reaction-picker">${["❤️", "😂", "🔥", "👏", "👍", "😮"].map((emoji) => `<button data-react="${emoji}" data-id="${id}" aria-label="React ${emoji}">${emoji}</button>`).join("")}</div>`,
      );
    if (action === "reply") {
      reply = m;
      editing = null;
      setComposeContext();
      document.querySelector("#message-input").focus();
    }
    if (action === "edit") {
      editing = id;
      reply = null;
      setComposeContext();
      document.querySelector("#message-input").value = m.body;
      document.querySelector("#message-input").focus();
    }
    if (action === "cancel-compose") {
      reply = null;
      editing = null;
      setComposeContext();
      document.querySelector("#message-input").value = "";
    }
    if (action === "delete")
      dialog(
        `<h2>Delete this message?</h2><p>This will remove it for everyone in this chat.</p><button class="button danger" data-action="confirm-delete" data-id="${id}">Delete message</button>`,
      );
    if (action === "confirm-delete") {
      const r = await call("message.delete", { id });
      if (r.error) throw new Error("Could not delete this message.");
      closeDialog();
      messages = messages.filter((m) => m.id !== id);
      await refreshMessages();
    }
    if (action === "older") await loadOlder(target);
    if (action === "notifications") await enablePush();
    if (action === "disable-notifications") {
      await unregisterPush();
      notice("Notifications turned off for this device.");
      showSettings();
    }
    if (action === "more-inbox") await showInbox(inboxPage + 1);
    if (action === "revoke-invite") {
      const r = await call("invitation.revoke", {
        email: target.dataset.email,
      });
      if (r.error) throw new Error("Could not revoke the invitation.");
      await showTeam();
      notice("Invitation revoked.");
    }
    if (action === "copy-invite") {
      await navigator.clipboard.writeText(location.origin + "/create-account/");
      notice("Signup link copied. Send it to the invited member.");
    }
  } catch (error) {
    notice(error.message || "Something went wrong. Please try again.", true);
    target.disabled = false;
  }
}
async function loadOlder(button) {
  if (!messages.length) return;
  button.disabled = true;
  const earliest = messages[0];
  const r = await call("message.list", {
    chat: currentChat,
    before: earliest.cursor_time || earliest.created_at,
    beforeId: earliest.id,
  });
  if (r.error) throw new Error("Could not load earlier messages.");
  if (!r.data.length) {
    button.remove();
    return;
  }
  messages = [...r.data.reverse(), ...messages];
  const rr = await call("reaction.list", { chat: currentChat });
  if (rr.error) throw new Error("Could not load reactions.");
  reactions = rr.data;
  renderMessages();
  if (r.data.length < 80) document.querySelector(".older-messages")?.remove();
}
async function showInbox(page) {
  const main = document.querySelector("#hub-main");
  if (page === 1)
    main.innerHTML =
      '<div class="workspace-page"><p class="eyebrow">OWNER & ADMIN</p><h1>Contact inbox</h1><p>Messages sent through the website’s contact form.</p><div id="inbox-list" role="status">Loading submissions…</div></div>';
  try {
    const r = await api("contact-inbox?page=" + page);
    if (hubView !== "inbox") return;
    inboxPage = page;
    inboxRows.push(...r.submissions);
    document.querySelector("#inbox-list").innerHTML =
      inboxRows
        .map(
          (row) =>
            `<article class="inbox-message"><div><h2>${e(row.subject || "Website enquiry")}</h2><time>${e(new Date(row.created_at).toLocaleString())}</time></div><p><strong>${e(row.name)}</strong> · ${e(row.email)}</p><p class="submission-body">${e(row.message)}</p><a class="plain-link" href="mailto:${encodeURIComponent(row.email)}">Reply by email ↗</a></article>`,
        )
        .join("") || "<p>No submissions yet.</p>";
    if (r.hasMore)
      document
        .querySelector("#inbox-list")
        .insertAdjacentHTML(
          "beforeend",
          '<button class="subtle-button" data-action="more-inbox">Load more submissions</button>',
        );
  } catch (error) {
    if (page === 1)
      document.querySelector("#inbox-list").textContent = error.message;
    else notice(error.message, true);
  }
}
async function showTeam() {
  if (profile.role !== "owner") return;
  await loadDirectory();
  const result = await call("invitation.list");
  if (result.error) throw new Error("Could not load invitations.");
  document.querySelector("#hub-main").innerHTML =
    `<div class="workspace-page"><p class="eyebrow">YOUR TEAM</p><h1>People & invitations</h1><p>Invite an email address and choose its role. They’ll receive a private link to set their name and password. Invitations expire after seven days; email links expire after 30 minutes. You can also share the signup page for a fresh link.</p><form id="invite-form" class="invite-form"><label>Email address<input name="email" type="email" required maxlength="254"></label><label>Role<select name="role" aria-label="Invitation role">${options()}</select></label><button class="button" type="submit">Add invitation</button></form><button class="subtle-button" data-action="copy-invite">Copy signup link</button><h2>Members</h2><div class="member-roster">${members.map((p) => `<form class="member-row" data-member="${p.id}"><span class="avatar">${e(initials(p.id))}</span><div><strong>${e(name(p.id))}</strong><small>${e(p.email)}${!p.active ? " · Suspended" : ""}</small></div>${p.role === "owner" ? '<span class="role-pill">Owner</span>' : `<label class="sr-only" for="role-${p.id}">Role for ${e(name(p.id))}</label><select id="role-${p.id}" name="role">${options(p.role)}</select><label class="active-label"><input type="checkbox" name="active" ${p.active ? "checked" : ""}> Active</label><button class="subtle-button" type="submit">Save</button>`}</form>`).join("")}</div><h2>Invitations</h2>${result.data.map((i) => `<div class="invite-row"><div><strong>${e(i.email)}</strong><small>${e(roleName(i.role))} · ${i.revoked ? "Revoked" : i.accepted_at ? "Registered" : new Date(i.expires_at) < new Date() ? "Expired" : "Pending"} · expires ${e(date(i.expires_at))}</small></div>${!i.revoked && !i.accepted_at ? `<button class="subtle-button" data-action="revoke-invite" data-email="${e(i.email)}">Revoke</button>` : ""}</div>`).join("") || "<p>No invitations yet.</p>"}</div>`;
}
function showSettings() {
  document.querySelector("#hub-main").innerHTML =
    `<div class="workspace-page settings-page"><p class="eyebrow">MAKE YOURSELF AT HOME</p><h1>My account</h1><p>${e(profile.email)} · ${e(roleName(profile.role))}</p><form id="profile-form"><label>Display name<input name="name" value="${e(profile.name)}" maxlength="80" required></label><button class="button" type="submit">Save name</button></form><h2>Notifications</h2><p>Enable notifications to hear about new messages, even when this tab is closed. On iPhone or iPad, add the site to your Home Screen first. Private message text is never included in push previews.</p><p id="push-status"></p><div class="settings-actions"><button class="subtle-button" data-action="notifications">Enable notifications</button><button class="subtle-button" data-action="disable-notifications">Turn off on this device</button></div><h2>Password</h2><p><a href="/forgot-password/">Send yourself a password-reset link</a>.</p></div>`;
  updateNotificationButton();
}
async function handleSubmit(event) {
  const form = event.target;
  if (!form.matches("#compose-form,#invite-form,#profile-form,.member-row"))
    return;
  event.preventDefault();
  if (form.id === "compose-form") {
    await sendMessage(form);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const f = new FormData(form);
  try {
    if (form.id === "invite-form") {
      const email = String(f.get("email")).trim().toLowerCase();
      if (members.some((p) => p.email === email))
        throw new Error(
          "This person already has an account. Update their membership below.",
        );
      const r = await call("invitation.create", { email, role: f.get("role") });
      if (r.error) throw new Error("Could not add the invitation.");
      await showTeam();
      notice(r.message);
    }
    if (form.id === "profile-form") {
      const display_name = String(f.get("name")).trim();
      const r = await call("member.rename", { name: display_name });
      if (r.error) throw new Error("Could not save your name.");
      profile.name = display_name;
      await loadDirectory();
      notice("Name updated.");
      document.querySelector(".hub-member strong").textContent = display_name;
    }
    if (form.matches(".member-row")) {
      const r = await call("member.manage", {
        id: form.dataset.member,
        role: f.get("role"),
        active: f.has("active"),
      });
      if (r.error) throw new Error("Could not update that member.");
      await showTeam();
      notice("Member updated.");
    }
  } catch (error) {
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
}
function pushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  );
}
async function updateNotificationButton() {
  const status = document.querySelector("#push-status");
  const buttons = document.querySelectorAll('[data-action="notifications"]');
  let text = !pushSupported()
    ? "Push is not supported in this browser."
    : !config.pushConfigured
      ? "Push delivery is awaiting server configuration."
      : Notification.permission === "denied"
        ? "Notifications are blocked. Change permission in your browser settings."
        : "Notifications are optional and apply to this device.";
  if (pushSupported() && config.pushConfigured) {
    const r = await navigator.serviceWorker.getRegistration("/");
    if (r && (await r.pushManager.getSubscription()))
      text = "Notifications are enabled on this device.";
  }
  if (status) status.textContent = text;
  buttons.forEach((b) => {
    b.disabled =
      !pushSupported() ||
      !config.pushConfigured ||
      Notification.permission === "denied";
    b.title = text;
  });
}
async function enablePush() {
  if (!pushSupported())
    throw new Error(
      "Push is not supported in this browser. On iOS, install the site on your Home Screen first.",
    );
  if (!config.pushConfigured)
    throw new Error("Push delivery needs server configuration.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notification permission was not granted. You can change it in browser settings.",
    );
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;
  const bytes = Uint8Array.from(
    atob(config.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  const data = subscription.toJSON();
  const result = await call("push.subscribe", { subscription: data });
  if (result.error) {
    await subscription.unsubscribe();
    throw new Error(
      "Could not save notification preferences. Try signing out and back in.",
    );
  }
  notice("Notifications enabled on this device.");
  await updateNotificationButton();
}
async function unregisterPush() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const r = await call("push.unsubscribe");
    if (r.error)
      throw new Error(
        "Could not remove notification access. Check your connection and try again.",
      );
    await subscription.unsubscribe();
  }
}
async function boot() {
  if (!root) return;
  Object.assign(config, await request("status", {}, true));
  if (!config.configured) {
    root.innerHTML =
      '<section class="auth-panel"><p class="eyebrow">MEMBER HUB</p><h1>We’re getting the team space ready.</h1><p>Secure member login is awaiting its database and email configuration. Please check back soon.</p><a class="plain-link" href="mailto:uaemodeluna@gmail.com">Contact UAEMUNA</a></section>';
    return;
  }
  const path = location.pathname;
  if (path === "/dashboard/") {
    const r = await auth.getSession();
    if (!r.data.session) {
      location.replace("/login/");
      return;
    }
    await loadHub();
    return;
  }
  authPage(
    path === "/create-account/"
      ? "create"
      : path === "/forgot-password/"
        ? "forgot"
        : path === "/reset-password/"
          ? "reset"
          : path === "/set-password/"
            ? "activate"
            : "login",
  );
}
boot().catch(() =>
  fatal("The member hub could not connect. Please try again shortly."),
);
