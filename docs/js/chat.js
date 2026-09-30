import { CHAT_WEBHOOK_URL, HAS_DEMO_VIDEO } from "./config.js";

// Official n8n chat widget, pinned. The /dist/ paths resolve for this version
// (checked: /dist/chat.bundle.es.js and /dist/style.css return 200; the
// paths without /dist/ return 404).
const N8N_CHAT = "https://cdn.jsdelivr.net/npm/@n8n/chat@1.38.7/dist";
// Must live inside docs/, the published site root. The original recording is
// assets/n8n/chatbot_demo.mp4; this is a copy (1600 x 850, 45 s, 1 MB).
const VIDEO_SRC = "assets/demo/chatbot_demo.mp4";

// Every state the section can be in. render() shows exactly one of them and
// sets the note beneath it at the same time, so the two never disagree.
const STATES = {
  live: {
    note: "Self-hosted, so it is live only when the host machine is running.",
  },
  video: {
    note: "Self-hosted, so it is live only when the host machine is running; a recorded demo is provided.",
  },
  offline: {
    heading: "The chatbot is offline",
    body: "It runs on a self-hosted n8n instance that is not connected to this page yet. A recorded demo will appear here.",
    note: "Self-hosted, so it is live only when the host machine is running; a recorded demo will be added.",
  },
  videoFailed: {
    heading: "The demo video did not load",
    body: "The recording could not be played. Reload the page to try again.",
    note: "Self-hosted, so it is live only when the host machine is running.",
  },
  liveFailed: {
    heading: "The chatbot could not load",
    body: "The chat service did not respond. Reload the page to try again.",
    note: "Self-hosted, so it is live only when the host machine is running.",
  },
};

let slot = null;
let note = null;

function card(heading, body) {
  const wrap = document.createElement("div");
  wrap.className = "offline";
  const h = document.createElement("h3");
  h.className = "h3";
  h.textContent = heading;
  const p = document.createElement("p");
  p.className = "prose";
  p.textContent = body;
  wrap.append(h, p);
  return wrap;
}

function videoPlayer() {
  const video = document.createElement("video");
  video.controls = true;
  video.preload = "metadata"; // 1 MB file; shows the first frame instead of a black box
  video.playsInline = true;
  video.width = 1600;
  video.height = 850;
  video.src = VIDEO_SRC;
  video.setAttribute("aria-label", "Recorded demo of the churn chatbot answering questions");
  // A missing or broken file replaces the player with a card: still one state.
  video.addEventListener(
    "error",
    () => {
      console.warn(`Demo video failed to load from ${VIDEO_SRC}.`);
      render("videoFailed");
    },
    { once: true }
  );
  return video;
}

// Replaces the slot's contents with exactly one state.
function render(state) {
  const s = STATES[state];
  slot.replaceChildren();
  slot.dataset.state = state;
  if (state === "live") {
    slot.className = "chat-slot chat-slot--live";
    const host = document.createElement("div");
    host.id = "n8n-chat";
    host.className = "n8n-chat-host";
    slot.append(host);
  } else if (state === "video") {
    slot.className = "chat-slot chat-slot--video";
    slot.append(videoPlayer());
  } else {
    slot.className = "chat-slot";
    slot.append(card(s.heading, s.body));
  }
  if (note) note.textContent = s.note;
}

function loadStyles(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.append(link);
  });
}

// The widget calls el.scrollIntoView({ block: "start" }) on each new message,
// which also scrolls the page and pushes the widget off screen mid-answer.
// For elements inside the widget, scroll only its own message list instead.
function containScroll(root) {
  const native = Element.prototype.scrollIntoView;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  Element.prototype.scrollIntoView = function (options) {
    if (!root.contains(this)) return native.call(this, options);
    let box = this.parentElement;
    while (box && box !== root) {
      const { overflowY } = getComputedStyle(box);
      if (/(auto|scroll)/.test(overflowY) && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    if (!box || box === root) return;
    const top = box.scrollTop + this.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  };
}

async function showLive() {
  render("live");
  containScroll(slot);
  try {
    const [{ createChat }] = await Promise.all([
      import(`${N8N_CHAT}/chat.bundle.es.js`),
      loadStyles(`${N8N_CHAT}/style.css`),
    ]);
    createChat({
      webhookUrl: CHAT_WEBHOOK_URL,
      mode: "fullscreen",
      target: "#n8n-chat",
      showWelcomeScreen: false,
      initialMessages: [
        "Hi! Ask anything about the customer churn analysis.",
        'Try asking: "Why do month-to-month customers churn?"',
      ],
      i18n: {
        en: {
          title: "Churn Insights Assistant",
          subtitle: "n8n, Gemini, Pinecone",
          inputPlaceholder: "Ask about churn drivers...",
          getStarted: "New Conversation",
          footer: "",
        },
      },
    });
  } catch (err) {
    console.info("Chat widget could not load; showing the fallback instead.");
    render(HAS_DEMO_VIDEO ? "video" : "liveFailed");
  }
}

// Exactly one starting state: live widget, else demo video, else offline card.
export function initChat() {
  slot = document.getElementById("chat-slot");
  note = document.getElementById("chat-note");
  if (!slot) return;

  if (CHAT_WEBHOOK_URL.trim()) {
    showLive();
  } else if (HAS_DEMO_VIDEO) {
    render("video");
  } else {
    render("offline");
  }
}
