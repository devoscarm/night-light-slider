const { Gio } = imports.gi;

const QuickSettings = imports.ui.quickSettings;

const Main = imports.ui.main;


class TemperatureUtils {
    // Temperature limite rilevate sperimentalmente sul dell latitude e5570
    // bisogna trovare un modo per farlo dinamicamente, magari all'installazione dell'estensione
    // Quindi probabilmente questa classe finirà in un file dedicato
    static MIN_TEMP = 1700;
    static MAX_TEMP = 4700;

    // I metodi statici sono associati alla classe e non alle istanze (non hanno proprio accesso
    // alle istanze infatti non si usa il 'this')

    static normalize(temp) {
        return 1 - (temp - this.MIN_TEMP) / (this.MAX_TEMP - this.MIN_TEMP);
    }

    // Denormalizzo la temperatura => vera temperatura in K
    static denormalize(value) {
        return Math.round((1 - value) * (this.MAX_TEMP - this.MIN_TEMP) + this.MIN_TEMP);
    }
}



class NightLightSlider {
    constructor() {

        this._connections = []  // Array per tracciare le connessioni (ed evitare il memory leak alla disabilitazione)

        try {
            this._settings = new Gio.Settings({ schema_id: 'org.gnome.settings-daemon.plugins.color' });
        } catch (e) {
            global.logError('Error initializing settings:', e);
            return;
        }
        
        // Crea uno slider con lo stile QuickSlider
        this._slider = new QuickSettings.QuickSlider({
            label: "Night Light",
            accessible_name: "Night Light temperature slider",
            iconName: 'night-light-symbolic',
        });

        // Posiziona lo slider sul valore corrente di temperatura, uso l'oggetto specifico
        // che rappresenta il controllo dello slider (.slider.value)
        this._slider.slider.set({value: this._getCurrentNormTemp() });


        // Collega il segnale per gestire i cambiamenti dello slider
        const sliderSignal = this._slider.slider.connect('notify::value', () => {
        	const value = this._slider.slider.value;
            const temperature = TemperatureUtils.denormalize(value)
            
            // uint perché night-light-temperature vuole un unsigned integer (positivo)
            // _settings è un'istanza di Gio.Settings che punta allo schema delle impostazioni
            // di Gnome per la Night Light
            this._settings.set_uint('night-light-temperature', temperature);
        });
        this._connections.push([this._slider.slider, sliderSignal]); // Salva la connessione
2
        // Aggiorna lo slider se il valore cambia da un'altra fonte
        const settingsSignal = this._settings.connect('changed::night-light-temperature', () => {
            this._slider.slider.set({value: this._getCurrentNormTemp() });
        });
        this._connections.push([this._settings, settingsSignal]); // Salva la connessione
    }

    _getCurrentNormTemp() {
        // uint perché night-light-temperature vuole un unsigned integer (positivo)
        const temperature = this._settings.get_uint('night-light-temperature');
        return TemperatureUtils.normalize(temperature);
    }
    
  
    addToQuickSettings() {
        const quickSettingsMenu = Main.panel.statusArea.quickSettings;

        if (quickSettingsMenu) {
            quickSettingsMenu.menu.addMenuItem(this._slider);
        } else {
            global.log("ERROR: Quick Settings menu not found");
        }
    }

 
    removeFromQuickSettings() {
        const quickSettingsMenu = Main.panel.statusArea.quickSettings;
        if (quickSettingsMenu) {
            quickSettingsMenu.menu.removeMenuItem(this._slider); // Rimuovi dal menu
        } else {
            global.log("ERROR: Quick Settings menu not found");
        }
    }

    destroy() {
        // Disconnetti tutti i segnali, per evitare il memory leak e tenere leggero il sistema
        for (const [object, id] of this._connections) {
            object.disconnect(id);
        }
        this._connections = [];

        // Pulisci altre risorse se necessario
        if (this._slider) {
            this._slider.destroy();
            this._slider = null;
        }
    }

}

let extension;

function init() {
    extension = new NightLightSlider();
}

function enable() {    
    extension.addToQuickSettings();
}

function disable() {
    if (extension) {
        extension.removeFromQuickSettings();

        // Distruggo anche le risorse allocate "per mantenere il sistema fluido" dice chatgpt haha
        extension.destroy();
        extension = null;
    }
}
