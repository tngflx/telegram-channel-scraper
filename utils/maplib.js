const { Client } = require("@googlemaps/google-maps-services-js");
const { mapLib: { geolocate, gmap: { API_KEY: gmapKey }, hereMap: { API_KEY: hereMapKey } }, telegram: { msgHistory } } = require('../config');
const { Logger, LogLevel } = require("./logger");
const { updateFail } = require('./db');
const { sleep } = require("./helper");

const head = new Headers()

const log = new Logger(LogLevel.DEBUG)

class Gmap {
    constructor() {
        this.client = new Client()
        this.currentLocation = null;
        this._initialize();
        this.API_KEY = gmapKey
    }

    async getBudget() {
        const projectId = 'winged-cargo-194715';
        const billingaccountID = '01F71E-AEA749-64B853';
        const apiKey = 'ya29.a0AWY7CkkKwnGGqW3gBgtvaZOXM43hmkwcS9IXWkk_6i2wKmHziZnmNwA901cOT37Iqz30Ti0JTuBIWqy-nWBHPlaL_2V6GJcNOq3BgBfHFAFtriF8pyhxOKj76QgZkomyAXRk50UejAjtoJYwKTFKKb3IUtf3iVhcZimEMQaCgYKAZoSARESFQG1tDrpCHyHub0BxzrpsCmmB7sHKQ0173';
        const budgetID = '586dfa9a-89c1-4247-9793-b17de057ab15'
        const url = `https://billingbudgets.googleapis.com/v1/billingAccounts/${billingaccountID}/budgets/${budgetID}`;

        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'x-goog-user-project': projectId,
                'Content-Type': 'application/json'
            }
        };

        await fetch(url, options)
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(`Request failed with status code ${response.status}`);
                }
            })
            .then(data => {
                const budget = data.budgetAmount?.specifiedAmount?.amount || 0;
                const currentSpend = data.amount?.spentAmount?.amount || 0;
                const percentage = (currentSpend / budget) * 100;

                console.log('Budget:', data);
                console.log('Current Spend:', currentSpend);
                console.log('Budget Percentage:', percentage);
            })
            .catch(error => {
                console.error('Error:', error.message);
            });
    }

    _initialize() {
        //await this.getBudget()

        if (typeof geolocate == 'boolean' && geolocate) {
            return this.client.geolocate({ params: { key: this["API_KEY"] }, data: { considerIp: true } })
                .then(({ data }) => {
                    const { lat, lng } = data.location;
                    log.warn(`My location : { Latitude: ${lat}, Longitude: ${lng} }`);
                    this.currentLocation = `${lat}, ${lng}`
                    return { lat, lng }
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
            key: this["API_KEY"],
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
            key: this["API_KEY"],
            input: place,
            inputtype: 'textquery',
            fields: ['place_id', 'formatted_address', 'name', 'geometry']
        };

        return this.client.findPlaceFromText({ params })
            .then(({ data }) => {
                let { place_id, name, formatted_address, geometry } = data?.candidates[0] || null;

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

class hereMap extends Gmap {
    firstRun = true
    constructor() {
        super()
        this._initialize();
        this.API_KEY = hereMapKey
    }

    async getPlace(address) {
        if (!this.firstRun) {
            await sleep(500)
            this.firstRun = false
        }

        this.currentLocation = this.currentLocation.replace(/\s+/g, '')
        const placeUrl = `https://autosuggest.search.hereapi.com/v1/autosuggest?at=${this.currentLocation}&limit=5&q=${encodeURIComponent(address)}&apiKey=${this.API_KEY}`

        return fetch(placeUrl)
            .then(response => response.json())
            .then(data => {
                if (data.items.length > 0) {
                    const { position: { lat, lng }, id, address: { label } } = data.items[0] || null;

                    return {
                        address: label,
                        place_id: id,
                        destination: `${lat},${lng}`
                    }
                } else {
                    console.log('Geocoding failed. Please check your API key and address.');
                }
            })
            .catch(error => {
                console.log('An error occurred:', error);
            });

    }

    getDistance({ destination, address }) {
        let origin = this.currentLocation

        const routeURL = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${origin}&destination=${destination}&return=summary&apikey=${this.API_KEY}`
        /**
         * Only proceed on with distancematrix api if locum
         * situated in nearby area
         */
        address = address.split(",")
            .slice(-3)
            .map((address) => address.trim())

        const checkIfContainWantedCity = msgHistory.wanted_states.some(value =>
            address.includes(value)
        );
        if (!checkIfContainWantedCity) return 'state_too_far';

        return fetch(routeURL)
            .then(response => response.json())
            .then(data => {
                console.log(data)
            }).catch((error) => {
                log.error(error?.response?.data?.error_message);
                return null;
            })

    }
}

module.exports = {
    Gmap,
    hereMap
}
