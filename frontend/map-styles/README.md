# DavaX cockpit map styles

Import `davax-light.json` and `davax-dark.json` into Google Maps Platform's cloud-based map styling editor. These are Cloud style JSON files, not the legacy JavaScript `styles` array.

## Design choices

### Neutral variants matching the Tesla references

Use `davax-neutral-light.json` and `davax-neutral-dark.json` for the quieter palette requested in the reference images. The original files remain available for comparison. These variants change colors only; they preserve every feature category, zoom threshold and visibility rule from the originals.

The neutral day style uses off-white land (`#E9E9E6`), medium grey water (`#ADB0B1`), grey-green parks (`#D5D8D4`), white roads and subdued grey labels. Highways lose their yellow tint. The neutral night style uses the cockpit's charcoal surface (`#1D1E22`), darker water (`#121316`), near-neutral parks and progressively brighter grey roads. The app's blue navigation route remains the main color accent.

Both neutral files passed Google's published JSON schema and an automated comparison confirming that only color values changed. They have not been published to Google Cloud or visually verified as rendered Cloud styles yet.

To use them, follow the import steps below with the neutral filenames, naming the styles **DavaX Neutral Day** and **DavaX Neutral Night**. Associate them with the Map ID already used by the app if you want to keep its current configuration. For a separate trial, use a test Vector Map ID instead.

In the **light** style's Map Settings, select **Standard** landmarks to remove the large illustrated building icons. Google applies that landmark setting to the dark style associated with the same Map ID. Landmark mode is a console setting and is not included in these JSON files.

When updating an existing style, **Save** creates a draft; click **Publish** to make it live. New styles publish on their first save but must be associated with a Map ID to affect the app. If the app's Map ID stays the same, no container restart is needed for Cloud style changes: refresh the app after propagation. If you change `VITE_GOOGLE_MAPS_MAP_ID` in the root `.env` for Docker, recreate the frontend with `docker compose up -d --force-recreate frontend` so the container receives the new value.

The day map uses warm off-white land, pale roads with grey edges, subdued green parks and blue water. The night map uses charcoal land and progressively brighter local roads, arterial roads and highways. Labels have matching background halos for readability.

Commercial food, shopping, lodging and entertainment labels are hidden. Fuel, parking, EV charging and rest stops appear from zoom 15; hospitals appear from zoom 14. Major landmarks appear from zoom 15. Street labels and buildings appear from zoom 16. Neighborhood names appear at zoom 12 and disappear at zoom 17, where street-level navigation takes priority. Google still controls collision handling and which eligible labels are actually displayed.

These changes affect the Google basemap only. Search results, app destination markers, route alternatives, route selection, driving simulation and the active blue route continue to use the existing app behavior. Hiding a basemap business label does not remove that place from search.

## Import and connect

1. Open Google Cloud Console, select the project used by the app's Maps API key, and open **Google Maps Platform > Map Styles**.
2. Choose **Create style**, open the **JSON** tab, and upload `davax-light.json`. Inspect the preview and save it as **DavaX Day**. Repeat with `davax-dark.json`, naming it **DavaX Night**. Google's first save publishes each new style; leave the styles unattached while reviewing them.
3. Create a separate test Map ID for **JavaScript**, using **Vector** rendering. Associate the light and dark styles with that same Map ID. The app already selects the appropriate color scheme when its theme changes.
4. In each style's Map Settings, choose standard landmarks if illustrated landmarks compete with the cockpit. Keep the existing building mode initially so the driving view retains its current behavior. These settings are controlled in the console, not in the JSON files.
5. Start with the existing POI density. The category filters already reduce clutter. If the preview still feels busy, try a lower density in the light style; Google applies that setting to the dark style on the same Map ID too. Check that useful service labels remain visible.
6. Put the new test ID into `VITE_GOOGLE_MAPS_MAP_ID` in the root `.env.local`, alongside any existing local overrides. Restart Vite. Do not replace the API key. A Map ID is configuration, not a secret.

```dotenv
VITE_GOOGLE_MAPS_MAP_ID=your_test_vector_map_id
```

For deployment, set the same environment variable in the frontend build environment and rebuild. Cloud style changes can take time to propagate, so avoid assuming an immediate refresh confirms the final published result.

## Visual review before using the style for a presentation

Check Bucharest at zoom 12, 15, 17 and 19 in both themes. Compare a dense city center, a highway and a park or lake. Confirm that the blue active route remains easy to follow, alternative routes remain secondary, and street labels remain legible in the tilted driving view. Check a searched destination and fuel-stop markers for overlap. These files have passed Google's published JSON schema; their appearance still needs review in the Cloud preview and the actual app.

To revert the local trial, restore the previous `VITE_GOOGLE_MAPS_MAP_ID` value and restart Vite. Keep the existing production Map ID until the test style has been reviewed.

## References

- [Import Cloud style JSON](https://developers.google.com/maps/documentation/javascript/cloud-customization/json)
- [Associate light and dark styles, preview and publish](https://developers.google.com/maps/documentation/javascript/cloud-customization/map-styles)
- [Zoom-dependent styling](https://developers.google.com/maps/documentation/javascript/cloud-customization/zoom-levels)
- [POI density settings](https://developers.google.com/maps/documentation/javascript/cloud-customization/poi-behavior-customization)
- [Official JSON schema used for validation](https://developers.google.com/static/maps/cbms-json-schema.json)
- [Standard versus illustrated landmarks](https://developers.google.com/maps/documentation/javascript/cloud-customization/landmarks)
