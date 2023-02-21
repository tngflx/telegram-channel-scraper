var _path = require('path');
var _fsExtra = require('fs-extra');

class JsonStorage {
    constructor(file, data) {
        this.file = normalizePath(file);
        if (!(0, _fsExtra.pathExistsSync)(this.file) || !!data) (0, _fsExtra.outputJsonSync)(this.file, data || {});
    }
    get(key) {
        return Promise.resolve((0, _fsExtra.readJsonSync)(this.file)[key]);
    }

    set(key, val) {
        const data = (0, _fsExtra.readJsonSync)(this.file);
        data[key] = val;
        (0, _fsExtra.outputJsonSync)(this.file, data);
        return Promise.resolve();
    }

    has(key) {
        return Promise.resolve(!!(0, _fsExtra.readJsonSync)(this.file)[key]);
    }

    remove(...keys) {
        const data = (0, _fsExtra.readJsonSync)(this.file);
        for (const key of keys) {
            delete data[key];
        }
        (0, _fsExtra.outputJsonSync)(this.file, data);
        return Promise.resolve();
    }
    clear() {
        (0, _fsExtra.outputJsonSync)(this.file, {});
        return Promise.resolve();
    }
}

exports.JsonStorage = JsonStorage;
function normalizePath(filepath) {
    const parsed = (0, _path.parse)(filepath);
    if (parsed.ext !== '.json') return (0, _path.format)(Object.assign({}, parsed, { ext: '.json' }));
    return filepath;
}

exports.Storage = JsonStorage;
exports.default = JsonStorage;