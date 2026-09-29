window.showAddScore = showAddScore;
window.startHold = startHold;
window.cancelHold = cancelHold;
window.saveScore = saveScore;
window.savePlayer = savePlayer;
window.showAddPlayer = showAddPlayer;
window.closeDialogs = closeDialogs;

const apiUrl = "https://script.google.com/macros/s/AKfycbyW3a0PLGXdRIbZhi1tBydf997MBmmPHoQXq1Sd5u_oEyHbAGezwKYphacRkQSBX3JM/exec";

const rankingCacheKey = "rummiklub_ranking_cache";
const queueStorageKey = "rummiklub_submit_queue";

let members = [];
let guests = [];
let membersHeaders = [];
let guestsHeaders = [];
let selectedPlayer = null;
let memberTurns = "";

let holdTimer = null;
let holdPlayer = null;

class QueueHandler
{
    constructor()
    {
        this.queue = this.load();
        this.processing = false;
        this.retryTimer = null;
    }

    load()
    {
        try
        {
            const data = localStorage.getItem(queueStorageKey);
            return data ? JSON.parse(data) : [];
        }
        catch (error)
        {
            console.error("Queue load failed", error);
            return [];
        }
    }

    save()
    {
        localStorage.setItem(
            queueStorageKey,
            JSON.stringify(this.queue)
        );
    }

    add(request)
    {
        const item =
        {
            id: request.id,
            payload: request.payload,
            created: Date.now(),
            attempts: 0
        };

        this.queue.push(item);
        this.save();

        console.log("Queue: added", item);

        this.process();

        return item;
    }

    remove(id)
    {
        this.queue = this.queue.filter(item => item.id !== id);
        this.save();
    }

    async process()
    {
        if (this.processing)
        {
            return;
        }

        if (!this.queue.length)
        {
            return;
        }

        this.processing = true;

        try
        {
            while (this.queue.length)
            {
                const item = this.queue[0];

                console.log("Queue: processing", item);

                try
                {
                    item.attempts++;
                    this.save();

                    const response = await apiPost(item.payload);

                    if (!response.ok)
                    {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const result = await response.json();

                    if (result.success !== true)
                    {
                        throw new Error("Server rejected request");
                    }

                    console.log(
                        "Queue: completed",
                        item.id,
                        result
                    );

                    this.remove(item.id);

                    await loadPlayers(true);
                }
                catch (error)
                {
                    console.error(
                        "Queue: failed",
                        item.id,
                        error
                    );

                    this.save();

                    this.scheduleRetry();

                    break;
                }
            }
        }
        finally
        {
            this.processing = false;
        }
    }

    scheduleRetry()
    {
        if (this.retryTimer)
        {
            return;
        }

        const delay = this.getRetryDelay();

        console.log(
            `Queue: retry scheduled in ${delay / 1000}s`
        );

        this.retryTimer = setTimeout(() =>
        {
            this.retryTimer = null;
            this.process();
        }, delay);
    }

    getRetryDelay()
    {
        if (!this.queue.length)
        {
            return 5000;
        }

        const attempts = this.queue[0].attempts;

        if (attempts <= 1) return 5000;
        if (attempts <= 2) return 15000;
        if (attempts <= 3) return 30000;
        if (attempts <= 4) return 60000;
        if (attempts <= 5) return 120000;

        return 300000;
    }

    start()
    {
        if (this.queue.length)
        {
            console.log(
                `Queue: ${this.queue.length} pending request(s)`
            );

            this.process();
        }
    }
}

class DataCache
{
    constructor()
    {
        this.data = this.load();
    }

    load()
    {
        try
        {
            const data = localStorage.getItem(rankingCacheKey);

            if (!data)
            {
                return null;
            }

            return JSON.parse(data);
        }
        catch (error)
        {
            console.error("Cache load failed", error);
            return null;
        }
    }

    save(data)
    {
        try
        {
            localStorage.setItem(
                rankingCacheKey,
                JSON.stringify(data)
            );

            this.data = data;

            console.log(
                "Cache: ranking updated"
            );
        }
        catch (error)
        {
            console.error("Cache save failed", error);
        }
    }

    hasData()
    {
        return this.data !== null;
    }

    get()
    {
        return this.data;
    }
}

const queueHandler = new QueueHandler();
const dataCache = new DataCache();

let queueLogs = [];
let queueSending = false;
let queueFetching = false;

function addQueueLog(message)
{
    const time = new Date();

    const timestamp =
        `${String(time.getHours()).padStart(2, "0")}:` +
        `${String(time.getMinutes()).padStart(2, "0")}:` +
        `${String(time.getSeconds()).padStart(2, "0")}`;

    const line = `${timestamp} ${message}`;

    queueLogs.unshift(line);

    if (queueLogs.length > 10)
    {
        queueLogs = queueLogs.slice(0, 10);
    }

    console.log(line);

    renderQueueInfo();
}

function setQueueSending(value)
{
    queueSending = value;
    renderQueueInfo();
}

function setQueueFetching(value)
{
    queueFetching = value;
    renderQueueInfo();
}

function renderQueueInfo()
{
    const icon = document.getElementById("queueStatusIcon");
    const text = document.getElementById("queueStatusText");
    const logs = document.getElementById("queueLogs");

    if (!icon || !text || !logs)
    {
        return;
    }

    if (queueSending)
    {
        icon.innerHTML = `<span class="queueSpinner"></span>`;
        text.textContent = "Verzenden...";
    }
    else if (queueFetching)
    {
        icon.innerHTML = `<span class="queueSpinner"></span>`;
        text.textContent = "Ophalen...";
    }
    else
    {
        icon.textContent = "✓";
        text.textContent = "Up-to-date";
    }

    logs.innerHTML = queueLogs
        .map(line => `<div class="queueLogLine">${line}</div>`)
        .join("");
}

function toggleQueueInfo()
{
    const info = document.getElementById("queueInfo");
    const icon = document.getElementById("queueExpandIcon");

    info.classList.toggle("expanded");

    icon.textContent =
        info.classList.contains("expanded") ? "⌃" : "⌄";
}

function showPlayerInfo(naam, isMember)
{
    const players = isMember ? members : guests;
    const speler = players.find(player => player.naam === naam);

    if (!speler)
    {
        return;
    }

    const spellen = Number(speler.spellen) || 0;
    const wins = Number(speler.wins) || 0;
    const punten = Number(speler.punten) || 0;
    const score = Number(speler.score) || 0;

    document.getElementById("playerInfoName").textContent = speler.naam;

    const details = document.getElementById("playerInfoDetails");

    let html = `
        <div class="playerStats">

            <div class="playerLastGame">
                Laatste spel: ${formatLast(speler.last)}
            </div>

            <div class="statGrid">

                <div class="statCard">
                    <span class="statLabel">Punten</span>
                    <strong>${punten}</strong>
                </div>

                <div class="statCard">
                    <span class="statLabel">Beurten</span>
                    <strong>${spellen}</strong>
                </div>

                <div class="statCard">
                    <span class="statLabel">Wins</span>
                    <strong>${wins}</strong>
                </div>

                <div class="statCard">
                    <span class="statLabel">Score</span>
                    <strong>${score}</strong>
                </div>

            </div>
    `;

    if (isMember)
    {
        const winRate = spellen > 0
            ? (wins / spellen) * 100
            : 0;

        const scoreNextWin = punten / (spellen + 1);

        const position = members.filter(player =>
            Number(player.score) < scoreNextWin
        ).length;

        const positionStr =
            position === 0 ? "🥇 1e" :
            position === 1 ? "🥈 2e" :
            position === 2 ? "🥉 3e" :
            `${position + 1}e`;

        html += `
            <div class="winRateSection">

                <div class="winRateHeader">
                    <span>Win rate</span>
                    <strong>${winRate.toFixed(0)}%</strong>
                </div>

                <div class="winRateBar">
                    <div
                        class="winRateFill"
                        style="width:${Math.min(winRate, 100)}%">
                    </div>
                </div>

            </div>

            <div class="nextWinCard">

                <div>
                    <span class="nextWinLabel">Bij volgende win</span>
                    <strong>${scoreNextWin.toFixed(1)}</strong>
                </div>

                <div class="nextWinPosition">
                    ${positionStr}
                </div>

            </div>
        `;
    }

    html += `
        </div>
    `;

    details.innerHTML = html;

    document.getElementById("playerInfoDialog").showModal();
}

function formatLast(value)
{
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    const days = ["zo", "ma", "di", "wo", "do", "vr", "za"];
    const months = [
        "jan",
        "feb",
        "mrt",
        "apr",
        "mei",
        "jun",
        "jul",
        "aug",
        "sept",
        "okt",
        "nov",
        "dec"
    ];

    const pad = n => String(n).padStart(2, "0");

    return `${days[d.getDay()]} ${pad(d.getDate())} ${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}u${pad(d.getMinutes())}`;
}

function startHold(name)
{
    holdPlayer = name;

    holdTimer = setTimeout(() =>
    {
        setCookie("playerName", holdPlayer);
        holdPlayer = null;
        render();
    }, 400);
}

function cancelHold()
{
    if (holdTimer)
    {
        clearTimeout(holdTimer);
        holdTimer = null;
    }

    holdPlayer = null;
}

function setCookie(name, value, days = 3650)
{
    const d = new Date();

    d.setTime(
        d.getTime() + days * 24 * 60 * 60 * 1000
    );

    document.cookie =
        `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/`;
}

function getCookie(name)
{
    const match = document.cookie
        .split("; ")
        .find(r => r.startsWith(name + "="));

    if (!match) return null;

    return decodeURIComponent(match.split("=")[1]);
}

function cleanPlayerName(name)
{
    if (!name) return "";

    return name
        .trim()
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map(p =>
            p.charAt(0).toUpperCase() + p.slice(1)
        )
        .join(" ");
}

function formatTimestamp(d)
{
    const pad = n => String(n).padStart(2, "0");

    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function apiPost(payload)
{
    setQueueSending(true);

    addQueueLog(`Sending ${payload.action}`);

    try
    {
        const response = await fetch(apiUrl,
        {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (!response.ok)
        {
            throw new Error(`HTTP ${response.status}`);
        }

        addQueueLog(`${payload.action} succeeded`);

        return response;
    }
    catch (error)
    {
        addQueueLog(`${payload.action} failed: ${error.message}`);
        throw error;
    }
    finally
    {
        setQueueSending(false);
    }
}

async function readRanking()
{
    setQueueFetching(true);
    addQueueLog("Fetching ranking");

    try
    {
        const response = await fetch(`${apiUrl}?action=readRanking`);

        if (!response.ok)
        {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        addQueueLog("Ranking fetched");

        return data;
    }
    catch (error)
    {
        addQueueLog(`Fetch failed: ${error.message}`);
        throw error;
    }
    finally
    {
        setQueueFetching(false);
    }
}

function applyRankingData(data)
{
    const membersRaw = data.members;
    const guestsRaw = data.guests;
    const paramsRaw = data.params;

    const extract = data =>
    {
        if (!Array.isArray(data) || data.length === 0)
        {
            return {
                headers: [],
                rows: []
            };
        }

        return {
            headers: data[0],
            rows: data.slice(1)
        };
    };

    const membersSplit = extract(membersRaw);
    const guestsSplit = extract(guestsRaw);

    membersHeaders = membersSplit.headers;
    guestsHeaders = guestsSplit.headers;

    const mapRow = r =>
    ({
        naam: r[0],
        score: Number(r[1]) || 0,
        spellen: Number(r[2]) || 0,
        wins: Number(r[3]) || 0,
        punten: Number(r[4]) || 0,
        last: r[5]
    });

    members = membersSplit.rows
        .filter(r => r && r[0])
        .map(mapRow);

    guests = guestsSplit.rows
        .filter(r => r && r[0])
        .map(mapRow);

    memberTurns = paramsRaw?.[0]?.[1] || "";

    render();
}

async function loadPlayers(background = false)
{
    if (!background)
    {
        const cached = dataCache.get();

        if (cached)
        {
            console.log("Cache: rendering cached ranking");
            applyRankingData(cached);
        }

        document.getElementById("loader").style.display =
            cached ? "none" : "flex";
    }

    try
    {
        const data = await readRanking();

        dataCache.save(data);

        applyRankingData(data);
    }
    catch (error)
    {
        console.error(
            "Fetch: ranking failed",
            error
        );
    }
    finally
    {
        document.getElementById("loader").style.display = "none";
    }
}

function render()
{
    const main = document.getElementById("rankingMain");
    const secondary = document.getElementById("rankingSecondary");

    const membersHeaderRow =
        document.getElementById("membersHeaderRow");

    const guestsHeaderRow =
        document.getElementById("guestsHeaderRow");

    const currentPlayer =
        getCookie("playerName") || "";

    main.innerHTML = "";
    secondary.innerHTML = "";

    if (membersHeaders.length)
    {
        membersHeaderRow.innerHTML = `
            <th>
                <a href="https://docs.google.com/spreadsheets/u/0/?q=%22Rummiklub%25%22"
                   target="_blank"
                   style="color:inherit; text-decoration:none;">
                    <span class="rankingIndex">&nbsp;</span>${membersHeaders[0] ?? ""}
                </a>
            </th>
            <th>${membersHeaders[1] ?? ""}</th>
            <th>${membersHeaders[2] ?? ""}</th>
            <th>${membersHeaders[3] ?? ""}</th>
            <th></th>
        `;
    }

    if (guestsHeaders.length)
    {
        guestsHeaderRow.innerHTML = `
            <th>
                <a href="https://docs.google.com/spreadsheets/u/0/?q=%22Rummiklub%25%22"
                   target="_blank"
                   style="color:inherit; text-decoration:none;">
                    <span class="rankingIndex">&nbsp;</span>${guestsHeaders[0] ?? ""}
                </a>
            </th>
            <th>${guestsHeaders[1] ?? ""}</th>
            <th>${guestsHeaders[2] ?? ""}</th>
            <th>${guestsHeaders[3] ?? ""}</th>
            <th></th>
        `;
    }

    document.getElementById("memberTurnsText").textContent =
        memberTurns;

    const renderRows = (players, target, isMembers) =>
    {
        let html = "";

        players.forEach((speler, index) =>
        {
            const isOwner =
                speler.naam === currentPlayer;

            html += `
                <tr>
                    <td
                        class="playerName"
                        title="${formatLast(speler.last)} ${speler.punten}"
                        onclick="showPlayerInfo('${speler.naam}', ${isMembers})">
                        <span class="rankingIndex">${isMembers
                            ? (
                                index === 0
                                    ? "🥇"
                                    : index === 1
                                        ? "🥈"
                                        : index === 2
                                            ? "🥉"
                                            : index + 1
                            )
                            : "&nbsp;"}</span>${speler.naam}
                    </td>

                    <td><b>${speler.score}</b></td>
                    <td>${speler.spellen}</td>
                    <td>${speler.wins}</td>

                    <td>
                        <button
                            class="plusBtn ${isOwner ? "" : "disabled"}"
                            onclick="if(${isOwner}) showAddScore('${speler.naam}')"
                            onmousedown="startHold('${speler.naam}', event)"
                            onmouseup="cancelHold()"
                            onmouseleave="cancelHold()"
                            ontouchstart="startHold('${speler.naam}', event)"
                            ontouchend="cancelHold()"
                        >
                            ${isOwner ? "+" : "-"}
                        </button>
                    </td>
                </tr>
            `;
        });

        target.innerHTML = html;
    };

    renderRows(
        members,
        main,
        true
    );

    renderRows(
        guests,
        secondary,
        false
    );

    document.getElementById("mainTable").style.display =
        members.length ? "table" : "none";

    document.getElementById("secondaryTable").style.display =
        guests.length ? "table" : "none";
}

function showAddScore(naam)
{
    selectedPlayer = naam;

    document.getElementById("scoreInput").value = "";

    document.getElementById("scoreDialog").showModal();
}

function showAddPlayer()
{
    document.getElementById("playerNameInput").value = "";
    document.getElementById("playerScoreInput").value = "";

    document.getElementById("playerDialog").showModal();
}

function closeDialogs()
{
    document.getElementById("scoreDialog").close();
    document.getElementById("playerDialog").close();
}

async function saveScore()
{
    const input =
        document.getElementById("scoreInput").value;

    const punten = parsePunten(input);

    if (punten === null)
    {
        return;
    }

    const timestamp =
        formatTimestamp(new Date());

    const key =
        `${selectedPlayer}-${timestamp}`;

    const payload =
    {
        action: "addRow",
        sheetName: "GameTable",
        data:
        [
            key,
            selectedPlayer,
            timestamp,
            punten
        ]
    };

    queueHandler.add(
    {
        id: key,
        payload: payload
    });

    closeDialogs();
}

async function savePlayer()
{
    const naam = cleanPlayerName(
        document.getElementById("playerNameInput").value
    );

    const puntenInput =
        document.getElementById("playerScoreInput").value;

    const punten =
        parsePunten(puntenInput);

    if (!naam)
    {
        alert("Voer een naam in");
        return;
    }

    if (punten === null)
    {
        return;
    }

    if ([...members, ...guests]
        .some(x =>
            x.naam.toLowerCase() === naam.toLowerCase()
        ))
    {
        alert("Speler bestaat al");
        return;
    }

    const timestamp =
        formatTimestamp(new Date());

    const playerId =
        `player-${naam}-${timestamp}`;

    const gameId =
        `${naam}-${timestamp}`;

    const payload =
    {
        action: "addPlayer",
        name: naam,
        timestamp: timestamp,
        points: punten
    };

    queueHandler.add(
    {
        id: playerId,
        payload: payload
    });

    setCookie(
        "playerName",
        naam
    );

    closeDialogs();
}

function parsePunten(input)
{
    const value = input.trim();

    if (!value)
    {
        alert("Voer een score in");
        return null;
    }

    const values =
        value.match(/\d+/g);

    if (!values)
    {
        alert("Voer een geldige score in");
        return null;
    }

    const punten =
        values.reduce(
            (sum, value) =>
                sum + Number(value),
            0
        );

    if (!Number.isSafeInteger(punten))
    {
        alert("Score is te groot");
        return null;
    }

    return punten;
}

queueHandler.start();
loadPlayers();
