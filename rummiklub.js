window.showAddScore = showAddScore;
window.startHold = startHold;
window.cancelHold = cancelHold;
window.saveScore = saveScore;
window.savePlayer = savePlayer;
window.showAddPlayer = showAddPlayer;
window.closeDialogs = closeDialogs;

const apiUrl = "https://script.google.com/macros/s/AKfycbwi_PdOKLs0JzIPspPLX7230lgJv9AvmEQCHhSELMl-aUm1vNNwS2B3hEAgjCYwjRcpNA/exec";

let members = [];
let guests = [];
let membersHeaders = [];
let guestsHeaders = [];
let selectedPlayer = null;
let memberTurns = "";

let holdTimer = null;
let holdPlayer = null;


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

    const winRate = spellen > 0
        ? (wins / spellen) * 100
        : 0;

    const scoreNextWin = punten / (spellen + 1);

    document.getElementById("playerInfoName").textContent = speler.naam;

    let details =
        `Laatste spel: \n${formatLast(speler.last)}\n` +
        `Punten: \n${punten}\n` +
        `Win ratio: \n${winRate.toFixed(1)}%\n` +
        `Score bij next win: \n${scoreNextWin.toFixed(1)}\n`;

    if (isMember)
    {
        const position = members.filter(player =>
            Number(player.score) < scoreNextWin
        ).length + 1;

        details += `Pos bij next win: \n${position}e plaats`;
    }

    document.getElementById("playerInfoDetails").textContent = details;

    document.getElementById("playerInfoDialog").showModal();
}

function formatLast(value)
{
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    const days = ["zo", "ma", "di", "wo", "do", "vr", "za"];
    const months = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sept", "okt", "nov", "dec"];

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
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);

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
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
}

function formatTimestamp(d)
{
    const pad = n => String(n).padStart(2, "0");

    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function apiPost(payload)
{
    return fetch(apiUrl,
    {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

async function readRanking()
{
    const response = await fetch(`${apiUrl}?action=readRanking`);

    if (!response.ok)
    {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

async function loadPlayers()
{
    document.getElementById("loader").style.display = "flex";

    try
    {
        const data = await readRanking();

        const membersRaw = data.members;
        const guestsRaw = data.guests;
        const paramsRaw = data.params;

        const extract = data =>
        {
            if (!Array.isArray(data) || data.length === 0)
            {
                return { headers: [], rows: [] };
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
    catch (error)
    {
        console.error(error);
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

    const membersHeaderRow = document.getElementById("membersHeaderRow");
    const guestsHeaderRow = document.getElementById("guestsHeaderRow");

    const currentPlayer = getCookie("playerName") || "";

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

    document.getElementById("memberTurnsText").textContent = memberTurns;

    const renderRows = (players, target,isMembers) =>
    {
        let html = "";

        players.forEach((speler, index) =>
        {
            const isOwner = speler.naam === currentPlayer;
            const ranking = index + 1;

            html += `
            <tr>
                <td
                    class="playerName"
                    title="${formatLast(speler.last)} ${speler.punten}"
                    onclick="showPlayerInfo('${speler.naam}', ${isMembers})">
                    <span class="rankingIndex">${isMembers && index === 0 ? "🥇" : isMembers && index === 1 ? "🥈" : isMembers && index === 2 ? "🥉" : index + 1} </span>${speler.naam}
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

    renderRows(members, main,true);
    renderRows(guests, secondary,false);

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
    const input = document.getElementById("scoreInput").value;
    const punten = parsePunten(input);

    if (punten === null) return;

    const btn = document.querySelector("#scoreDialog .saveBtn");

    btn.disabled = true;
    btn.classList.add("btnLoading");
    btn.innerHTML = `<span class="btnSpinner"></span>`;

    try
    {
        const timestamp = formatTimestamp(new Date());

        const response = await apiPost(
        {
            action: "addRow",
            sheetName: "GameTable",
            data: [
                `${selectedPlayer}-${timestamp}`,
                selectedPlayer,
                timestamp,
                punten
            ]
        });

        if (!response.ok)
        {
            throw new Error(`HTTP ${response.status}`);
        }

        closeDialogs();

        await loadPlayers();
    }
    catch (error)
    {
        console.error(error);
        alert("Opslaan mislukt");
    }
    finally
    {
        setTimeout(() =>
        {
            btn.disabled = false;
            btn.classList.remove("btnLoading");
            btn.innerHTML = "Opslaan";
        }, 10000);
    }
}

async function savePlayer()
{
    const naam = cleanPlayerName(
        document.getElementById("playerNameInput").value
    );

    const puntenInput = document.getElementById("playerScoreInput").value;
    const punten = parsePunten(puntenInput);

    if (!naam)
    {
        alert("Voer een naam in");
        return;
    }

    if (punten === null) return;

    if ([...members, ...guests]
        .some(x => x.naam.toLowerCase() === naam.toLowerCase()))
    {
        alert("Speler bestaat al");
        return;
    }

    const btn = document.querySelector("#playerDialog .saveBtn");

    btn.disabled = true;
    btn.classList.add("btnLoading");
    btn.innerHTML = `<span class="btnSpinner"></span>`;

    try
    {
        const timestamp = formatTimestamp(new Date());

        const response = await apiPost(
        {
            action: "addPlayer",
            name: naam,
            timestamp: timestamp,
            points: punten
        });

        if (!response.ok)
        {
            throw new Error(`HTTP ${response.status}`);
        }

        setCookie("playerName", naam);

        closeDialogs();

        await loadPlayers();
    }
    catch (error)
    {
        console.error(error);
        alert("Opslaan mislukt");
    }
    finally
    {
        setTimeout(() =>
        {
            btn.disabled = false;
            btn.classList.remove("btnLoading");
            btn.innerHTML = "Opslaan";
        }, 10000);
    }
}

function parsePunten(input)
{
    const value = input.trim();

    if (!value)
    {
        alert("Voer een score in");
        return null;
    }

    const values = value.match(/\d+/g);

    if (!values)
    {
        alert("Voer een geldige score in");
        return null;
    }

    const punten = values.reduce(
        (sum, value) => sum + Number(value),
        0
    );

    if (!Number.isSafeInteger(punten))
    {
        alert("Score is te groot");
        return null;
    }

    return punten;
}

loadPlayers();
