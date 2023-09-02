/** @param {NS} ns */
async function run(ns, target, moneyThresh, securityThresh) {
    while (true) {
        let sec = ns.getServerSecurityLevel(target) ;
        let mon = ns.getServerMoneyAvailable(target) ;
        if (sec > securityThresh) {
            ns.print('thresh: ', securityThresh);
            await ns.weaken(target);
        } else if (mon < moneyThresh) {
            ns.print('thresh: $', moneyThresh/1000000, 'M');
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}

/** @param {NS} ns */
export async function main(ns) {
    let target = ns.args[0];
    let moneyThresh = ns.getServerMaxMoney(target) * 0.75;
    let securityThresh = ns.getServerMinSecurityLevel(target) + 20;
    await run(ns, target, moneyThresh, securityThresh);
}