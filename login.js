import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

// Already holding a scorecard? Go straight in.
if (localStorage.getItem("dt_card_id")) location.replace("index.html");

function enter(card) {
  localStorage.setItem("dt_card_id", card.id);
  localStorage.setItem("dt_card_name", card.name || "Scorecard");
  location.replace("index.html");
}

$("openForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("openMsg");
  msg.className = "msg";
  msg.textContent = "Checking…";
  const { data, error } = await db.rpc("open_scorecard", { p_password: $("openPw").value });
  if (error) {
    msg.className = "msg err";
    msg.textContent = error.message;
    return;
  }
  const card = data && data[0];
  if (!card) {
    msg.className = "msg err";
    msg.textContent = "No scorecard with that password.";
    return;
  }
  enter(card);
});

$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("createMsg");
  msg.className = "msg";
  msg.textContent = "Creating…";
  const { data, error } = await db.rpc("create_scorecard", {
    p_name: $("newName").value,
    p_password: $("newPw").value,
  });
  if (error) {
    msg.className = "msg err";
    msg.textContent = /password_taken/.test(error.message)
      ? "That password is already in use — pick another."
      : error.message;
    return;
  }
  enter(data[0]);
});
