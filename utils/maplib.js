const { Client } = require("@googlemaps/google-maps-services-js");
const { mapLib: { geolocate, gmap: { API_KEY: key }, radarMap }, telegram: { msgHistory } } = require('../config');
const { Logger, LogLevel } = require("./logger");
const { updateFail } = require('./db');
const head = new Headers()

const log = new Logger(LogLevel.DEBUG)

class Gmap {
    constructor() {
        this.client = new Client()
        this.currentLocation = null;
        this._initialize();
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

    async _initialize() {
        //await this.getBudget()

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

//class radarMap {

//    constructor() {
//        this.client = new Client()
//        this.currentLocation = ''
//        this._initialize()
//    }

//    _initialize() {
//        if (typeof geolocate == 'boolean' && geolocate) {
//            return this.client.geolocate({ params: { key }, data: { considerIp: true } })
//                .then(({ data }) => {
//                    const { lat, lng } = data.location;
//                    log.warn(`My location : { Latitude: ${lat}, Longitude: ${lng} }`);
//                    this.currentLocation = [lat, lng]
//                })
//                .catch((err) => {
//                    log.error(err);
//                })
//        } else if (Array.isArray(geolocate)) {
//            const [lat, lng] = geolocate
//            log.warn(`My location : { Latitude: ${lat}, Longitude: ${lng} }`);
//            this.currentLocation = [lat, lng]
//        }
//    }

//    getPlace(address) {
//        const url = `https://api.radar.io/v1/geocode/forward?query=${encodeURIComponent(address)}&country=MY`;

//        return fetch(url, {
//            headers: {
//                Authorization: radarMap.API_KEY
//            }
//        }).then(response =>
//            response.json())
//            .then(data => {
//                // Extract latitude and longitude
//                const { latitude, longitude } = data.addresses[0];
//                return { latitude, longitude };
//            })
//            .catch(error => {
//                console.error('Geocode Forward API Error:', error);
//                throw error;
//            });
//    }

//    // Get Travel Duration API
//    getDistance(origin, destination) {
//        return null;
//        return geocodeForward(origin)
//            .then(originLocation => geocodeForward(destination))
//            .then(destinationLocation => {
//                const url = `https://api.radar.io/v1/route/duration?origin=${originLocation.latitude},${originLocation.longitude}&destination=${destinationLocation.latitude},${destinationLocation.longitude}`;
//                const options = {
//                    headers: {
//                        Authorization: `Bearer ${radarMap.API_KEY}`
//                    }
//                };

//                return fetch(url, options)
//                    .then(response => response.json())
//                    .then(data => {
//                        // Extract travel duration
//                        const { duration } = data.routes[0];
//                        return duration;
//                    });
//            })
//            .catch(error => {
//                console.error('Get Travel Duration API Error:', error);
//                throw error;
//            });
//    }

//}

module.exports = {
    Gmap
}
