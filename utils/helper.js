function callbackPromise() {
    // helper method for promises
    let resolve, reject;

    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

const checkIfContainKeyword = (strings, keywords) => {
    let trimmed_lower_strings = strings.trim().toLowerCase();
    return keywords.some((substr) => trimmed_lower_strings.includes(substr))
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    callbackPromise,
    checkIfContainKeyword,
    sleep
}