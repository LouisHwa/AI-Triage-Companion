/*
server uses post: /api/geo/nearby
accepts input in json 
{
    "latitude": x,
    "longitude": x,
    "radius_meters": x (default 5000)
}

server returns list of nearby medical facilities in format:
[
  {
    "id": "ChIJx2oFDP9NzDERtxfF5oRbhJ4",
    "name": "CARiNG Pharmacy | Sunway Square, Petaling Jaya",
    "address": "Unit No. Lg1-11, Lower Ground One, Sunway Square, Bandar Sunway, 47500 Petaling Jaya, Selangor, Malaysia",
    "latitude": 3.0650599,
    "longitude": 101.6042562,
    "rating": 5,
    "user_ratings_total": 104,
    "distance_meters": null,
    "place_type": "Pharmacy",
    "open_now": true
  },
  {
    "id": "ChIJy2f0fABNzDERZdXJpEBErec",
    "name": "Children Consultation Suite Sunway Medical Centre",
    "address": "3J84+8V, Bandar Sunway, 47500 Subang Jaya, Selangor, Malaysia",
    "latitude": 3.0658125000000003,
    "longitude": 101.6071875,
    "rating": 5,
    "user_ratings_total": 2,
    "distance_meters": null,
    "place_type": "Clinic",
    "open_now": null
  },
  {
    "id": "ChIJq-EkBgBNzDERflwhThdLEG4",
    "name": "Pediatric Emergency Sunway Medical Centre",
    "address": "Tower D, Jalan PJS11/26, Bandar Sunway, 47500 Subang Jaya, Selangor, Malaysia",
    "latitude": 3.0656901,
    "longitude": 101.60722659999999,
    "rating": 3.7,
    "user_ratings_total": 9,
    "distance_meters": null,
    "place_type": "Hospital",
    "open_now": null
  }, ... and so on, for now, scoped to 10 results from server.
]

1. Ask the user to allow permission to access their geographical location. If they deny, show an error message that location access is needed to find nearby medical facilities.
2. Can categorize results into "Pharmacy", "Clinic", and "Hospital" based on the place_type field, and display them in separate sections, can include 'ALL' also.
3. For routing or if they ask how to go? use the information here to get link to google maps directions: https://www.google.com/maps/dir/?api=1&destination_place_id={PLACE_ID}&destination={NAME}
4. Calculate the distance from user's location to each facility using the Haversine formula, and display it in km with 2 decimal places. (Note: the server currently does not return distance_meters, so this needs to be calculated on the client side using the latitude and longitude of both user and facility).
5. Show open/closed status based on the open_now field, and if null, show "Hours not available".
6. USE YOUR CREATIVITY BA HAHAHAHAH
*/
