function callbackPromise() {
    // helper method for promises
    let resolve, reject;

    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

module.exports = {
    callbackPromise
}