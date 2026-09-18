const micButton = document.getElementById("mic-button");
const micLabel = document.getElementById("mic-label");
const audioEl = document.getElementById("agent-audio");

let peerConnection = null;
let dataChannel = null;
let micStream = null;

function sendEvent(event) {
  if (dataChannel?.readyState === "open") {
    dataChannel.send(JSON.stringify(event));
  }
}

async function handleFunctionCall(name, args, callId) {
  if (name !== "search_resume") return;

  let query = "";
  try {
    query = JSON.parse(args).query ?? "";
  } catch {
    query = "";
  }

  let results = [];
  try {
    const res = await fetch("/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    results = data.results ?? [];
  } catch (err) {
    console.error("Retrieve failed:", err);
  }

  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(results.map((r) => r.text)),
    },
  });
  sendEvent({ type: "response.create" });
}

function handleServerEvent(event) {
  if (event.type === "response.function_call_arguments.done") {
    handleFunctionCall(event.name, event.arguments, event.call_id);
  }
}

function setListening(isListening) {
  micButton.classList.toggle("listening", isListening);
  const label = isListening ? "Stop talking" : "Start talking";
  micButton.setAttribute("aria-label", label);
  micLabel.textContent = label;
}

async function startSession() {
  micButton.disabled = true;

  try {
    const sessionRes = await fetch("/session", { method: "POST" });
    if (!sessionRes.ok) {
      throw new Error(`Session request failed: ${sessionRes.status}`);
    }
    const session = await sessionRes.json();
    const ephemeralKey = session.value;

    peerConnection = new RTCPeerConnection();

    peerConnection.ontrack = (event) => {
      audioEl.srcObject = event.streams[0];
    };

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream.getTracks().forEach((track) => peerConnection.addTrack(track, micStream));

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (e) => handleServerEvent(JSON.parse(e.data)));
    dataChannel.addEventListener("open", () => sendEvent({ type: "response.create" }));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpRes.ok) {
      throw new Error(`Voice connection failed: ${sdpRes.status}`);
    }

    const answer = { type: "answer", sdp: await sdpRes.text() };
    await peerConnection.setRemoteDescription(answer);

    setListening(true);
  } catch (err) {
    console.error(err);
    stopSession();
  } finally {
    micButton.disabled = false;
  }
}

function stopSession() {
  dataChannel?.close();
  peerConnection?.close();
  micStream?.getTracks().forEach((track) => track.stop());

  dataChannel = null;
  peerConnection = null;
  micStream = null;

  setListening(false);
}

micButton.addEventListener("click", () => {
  if (peerConnection) {
    stopSession();
  } else {
    startSession();
  }
});
