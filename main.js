const targets = [];

const minRam = 8192;
const hackServers = 1;
const growThreadCount = 100;
const hackThreadCount = 50;
const sleepTime = 1000;
const growToHackThresh = 0.75;
const hackToGrowThresh = 0.40;

const hackFile = 'scripts/hacker.js';
const growFile = 'scripts/grow-n-weaken.js';
const files = [hackFile, growFile];


function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** @param {NS} ns */
async function initServer(ns, name) {
    if (!ns.serverExists(name)) {
        if (ns.getServerMoneyAvailable('home') < ns.getPurchasedServerCost(minRam)) {
            ns.print("not enough money to buy server of RAM: ", minRam, " name ", name);
        } else {
            ns.purchaseServer(name, minRam);
        }
    } else if (ns.getServerMaxRam(name) < minRam) { 
        // can fail silently and thats ok
        ns.upgradePurchasedServer(name, minRam);
    }
}

function serverName(i) {
    if (i < 10) {
        return "mister_0" + i;
    } else {
        return "mister_" + i;
    }
}

/** @param {NS} ns */
async function startScript(ns, server, target, script, minThreads) {
    if (!ns.fileExists(script, server )) {
        ns.scp(script, server, 'home');
    }
    let ramReq = ns.getScriptRam(script);
    let availRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    let threads = Math.min(Math.floor(availRam / ramReq), minThreads);
    if (threads <= 0) {
        ns.print("Not runnning anything");
        ns.print("---------------------");
        return 0;
    }
    ns.print("RUNNING -> ", server, ": ",target," : ", threads);
    ns.exec(script, server, threads, target);
    return 1;
}


/** @param {NS} ns */
async function fill(ns, x) {
    let maxMoney = ns.getServerMaxMoney(x);
    return ns.getServerMoneyAvailable(x) / (maxMoney == 0 ? 1 : maxMoney);
}


/** @param {NS} ns */
async function findTarget(ns, reverse) {
    let ts = [];
    for (const t of targets) {
        ts.push([t, await fill(ns, t)]);
    }
    if (reverse) {
        ts.sort((a,b) => b[1] - a[1]);
    } else {
        ts.sort((a,b) => a[1] - b[1]);
    }
    ns.print("\n\n")
    for (let s of ts) {
        ns.print(s[0], " : ", s[1]);
    }
    return ts[getRandomInt(0,4)][0]; // choose a top 5 empty server
}



/** @param {NS} ns */
async function assignGrowers(ns) {
    for (let i=hackServers; i<25; i++) {
        let target = await findTarget(ns, false)
        let s = serverName(i);
        await initServer(ns, s);
        // if this target doenst need growing, we just turn this script call into a hack
        if (await fill(ns, target) > growToHackThresh) { 
            startScript(ns, s, await findTarget(ns, true), growFile, hackThreadCount);
        } else {
            startScript(ns, s, target, growFile, growThreadCount);
        }
    }
}

/** @param {NS} ns */
async function runHackerNodes(ns) {
    for (let i=0; i<hackServers; i++) {
        let s = serverName(i);
        await initServer(ns, s);
        let target = await findTarget(ns, true);
        if (await fill(ns, target) < hackToGrowThresh) {
            startScript(ns, s, await findTarget(ns, false), growFile, hackThreadCount);
        } else {
            startScript(ns, s, target, hackFile, hackThreadCount);
        }
    }
}

/** @param {NS} ns */
async function findServers(ns) {
    let found = new Map(); 
    let stack = ns.scan('home');
    while (stack.length > 0) {
        let server = stack.shift();
        found.set(server, await ns.getServerRequiredHackingLevel(server));
        ns.scan(server)
            .filter(s => !found.has(s))
            .forEach(s => stack.push(s));
    }
    return found;
}

/** @param {NS} ns */
async function connectServers(ns, servers) {
    let newServers = []
    servers.forEach(async server => {
            try {
                ns.brutessh(server);
                ns.ftpcrack(server);
                ns.relaysmtp(server);
                ns.httpworm(server);
                ns.sqlinject(server);
                ns.nuke(server);
                newServers.push(server)
            } catch {}
        });
    newServers.forEach(s => ns.print("added: ", s));
    return newServers;
}

// remove servers too high lvl and personal servers
/** @param {NS} ns */
async function filterServers(ns, allServers) {
    let level = ns.getHackingLevel();
    return [...allServers]
        .filter(([k,v]) => v <= level)
        .map(([k,v]) => k)
        .filter(s => !s.includes("mister_") || !s == "home")
        .filter(s => ns.getServerMaxMoney(s) > 0);
}

/** @param {NS} ns */
export async function main(ns) {
    if (ns.args[0] == 'del') {
        for (let i=0; i<25; i++) {
            let s = serverName(i);
            for (const file of files) {
                ns.scriptKill(file, s);
                ns.rm(file, s);
            }
        }
        return;
    }
    const allServers = await findServers(ns);
    const servers = await filterServers(ns, allServers);

    // already available servers
    servers.filter(s => ns.hasRootAccess(s))
        .forEach(s => { // for some reason, we need this check
            if (!targets.includes(s)) {
                targets.push(s)
            }
        });
    let curLevel = ns.getHackingLevel();
    while (true) {
        const newLevel = ns.getHackingLevel();
        if (newLevel > curLevel) {
            curLevel = newLevel;
            const newServers = (await filterServers(ns, allServers))
                .filter(s => !ns.hasRootAccess(s));
            if (newServers.length > 0) {
                const newTargets = await connectServers(ns, newServers);
                newTargets.filter(t => !targets.includes(t)).forEach(t => targets.push(t));
            }
        }
        await runHackerNodes(ns);
        await assignGrowers(ns);
        await ns.sleep(sleepTime);
    }
}
