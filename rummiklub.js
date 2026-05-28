//https://beautifier.io/

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
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/`;
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

async function readSheet(sheetName)
{
    const url = `${apiUrl}?action=readTable&sheetName=${sheetName}`;

    const response = await fetch(url);
    return response.json();
}

async function loadPlayers()
{
    document.getElementById("loader").style.display = "flex";

    try
    {
        const [membersRaw, guestsRaw, paramsRaw] = await Promise.all([
            readSheet("Members"),
            readSheet("Guests"),
            readSheet("Params")
        ]);

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
            punten: Number(r[3]) || 0,
            last: r[4]
        });

        members = membersSplit.rows.filter(r => r && r[0]).map(mapRow);
        guests = guestsSplit.rows.filter(r => r && r[0]).map(mapRow);

        memberTurns = paramsRaw?.[0]?.[1] || "";

        render();
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
            <th>${membersHeaders[0] ?? ""}</th>
            <th>${membersHeaders[1] ?? ""}</th>
            <th>${membersHeaders[2] ?? ""}</th>
            <th>${membersHeaders[3] ?? ""}</th>
            <th></th>
        `;
    }

    if (guestsHeaders.length)
    {
        guestsHeaderRow.innerHTML = `
            <th>${guestsHeaders[0] ?? ""}</th>
            <th>${guestsHeaders[1] ?? ""}</th>
            <th>${guestsHeaders[2] ?? ""}</th>
            <th>${guestsHeaders[3] ?? ""}</th>
            <th></th>
        `;
    }

    document.getElementById("memberTurnsText").textContent = memberTurns;

    const renderRows = (players, target) =>
    {
        let html = "";

        players.forEach(speler =>
        {
            const isOwner = speler.naam === currentPlayer;

            html += `
                <tr>
                    <td>${speler.naam}</td>
                    <td><b>${speler.score}</b></td>
                    <td>${speler.spellen}</td>
                    <td>${speler.punten}</td>
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

    renderRows(members, main);
    renderRows(guests, secondary);

    document.getElementById("mainTable").style.display = members.length ? "table" : "none";
    document.getElementById("secondaryTable").style.display = guests.length ? "table" : "none";
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
    const btn = document.querySelector("#scoreDialog .saveBtn");

    btn.disabled = true;
    btn.classList.add("btnLoading");
    btn.innerHTML = `<span class="btnSpinner"></span>`;

    try
    {
        const input = document.getElementById("scoreInput").value;
        const punten = Number(input);

        if (input === "" || !Number.isInteger(punten))
        {
            alert("Voer een geheel getal in");
            return;
        }

        const timestamp = formatTimestamp(new Date());

        await apiPost(
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

        closeDialogs();
        loadPlayers();
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
    const btn = document.querySelector("#playerDialog .saveBtn");

    btn.disabled = true;
    btn.classList.add("btnLoading");
    btn.innerHTML = `<span class="btnSpinner"></span>`;

    try
    {
        const naam = cleanPlayerName(document.getElementById("playerNameInput").value);
        const puntenInput = document.getElementById("playerScoreInput").value;
        const punten = puntenInput === "" ? 0 : Number(puntenInput);

        if (!naam || !Number.isInteger(punten))
        {
            alert("Ongeldige invoer");
            return;
        }

        if ([...members, ...guests].some(x => x.naam.toLowerCase() === naam.toLowerCase()))
        {
            alert("Speler bestaat al");
            return;
        }

        const timestamp = formatTimestamp(new Date());

        await apiPost(
        {
            action: "addRow",
            sheetName: "PlayerTable",
            data: [naam]
        });

        await apiPost(
        {
            action: "addRow",
            sheetName: "GameTable",
            data: [
                `${naam}-${timestamp}`,
                naam,
                timestamp,
                punten
            ]
        });

        setCookie("playerName", naam);

        closeDialogs();
        loadPlayers();
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

loadPlayers();
