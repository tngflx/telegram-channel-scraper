const { Client } = require("@googlemaps/google-maps-services-js");
const { gmap: { API_KEY: key, geolocate }, telegram: { msgHistory } } = require('../config');
const { Logger, LogLevel } = require("./logger");
const { updateFail } = require('./db');

const log = new Logger(LogLevel.DEBUG)

class Gmap {
    constructor() {
        this.client = new Client()
        this.currentLocation = null;
        this._initialize();
    }

    _initialize() {
        if (typeof geolocate == 'boolean' && geolocate) {
            return this.client.geolocate({ params: { key }, data: { considerIp: true } })
                .then(({ data }) => {
                    const { lat, lng } = data.location;
                    log.warn(`My location : { Latitude: ${lat}, Longitude: ${lng} }`);
                    this.currentLocation = `${lat}, ${lng}`
                })
                .catch((err) => {
                    log.error(err);
                })
        } else if (Array.isArray(geolocate)) {
            const [lat, lng] = geolocate
            log.warn(`My location : { Latitude: ${lat}, Longitude: ${lng} }`);
            this.currentLocation = `${lat}, ${lng}`
        }
    }

    async getDistance({ place_id, formatted_address }) {
        /**
         * Only proceed on with distancematrix api if locum
         * situated in nearby area
         */
        formatted_address = formatted_address.split(",")
            .slice(-3)
            .map((address) => address.trim())

        const checkIfContainWantedCity = msgHistory.wanted_states.some(value =>
            formatted_address.includes(value)
        );
        if (!checkIfContainWantedCity) return 'state_too_far';

        const params = {
            key,
            origins: [this.currentLocation],
            destinations: [`place_id:${place_id}`],
            mode: 'driving',
            units: 'metric'
        };

        return this.client.distancematrix({ params })
            .then(({ data }) => {
                const { distance, duration } = data.rows[0].elements[0];
                return {
                    distance: distance.text,
                    duration: duration.text
                };
            }).catch((error) => {
                log.error(error?.response?.data?.error_message);
                return null;
            })

    }

    /**
     * Todo : To include address on another msg_line to make it more specific location
     * @param {any} place
     * @returns
     */
    getPlace(place) {
        const params = {
            key,
            input: place,
            inputtype: 'textquery',
            fields: ['place_id', 'formatted_address', 'name', 'geometry']
        };

        return this.client.findPlaceFromText({ params })
            .then(({ data }) => {
                console.log(data, place)
                let { place_id, name, formatted_address, geometry } = data?.candidates[0];

                return {
                    place_id,
                    name,
                    formatted_address,
                    location: geometry?.location
                };

            }).catch(async (error) => {
                await updateFail(place)
                log.error(error);
                return null;
            })

    }
}

module.exports = {
    Gmap
}
