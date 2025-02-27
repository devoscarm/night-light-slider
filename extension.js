import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { QuickSlider, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const quickSettings = Main.panel.statusArea.quickSettings;

const ICON_NAME = 'night-light-symbolic';
const COLOR_SCHEMA = 'org.gnome.settings-daemon.plugins.color';
const TEMPERATURE_KEY = 'night-light-temperature';
const ENABLE_KEY = 'night-light-enabled';

// You can use `journalctl -f | grep '\[NightLightSlider\]'` to see realtime logs.
const EXT_LOG_NAME = "[NightLightSlider]";
const extLog = (msg) => {
    console.log(EXT_LOG_NAME, msg);
}

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


const NightLightItem = GObject.registerClass(
class NightLightItem extends QuickSlider{
    _init() {
        super._init({
            iconName: ICON_NAME,
        });

        // We store signals to properly disconnect them
        this._connections = [];

        // Per il momento uso la classe di gnome basata su GSettings
        // In futuro passerò al sistema di messaggistica DBus
        this._settings = new Gio.Settings({ schema_id: COLOR_SCHEMA });

        
        this._updateVisibity();

        // Listening for activation of night light 
        this._connections.push(
            this._settings.connect(`changed::${ENABLE_KEY}`, 
                () => this._updateVisibity()));

        // Modify the slider when the system night light temperature changes
        // (ex if another source modify the value)
        this._connections.push(
            this._settings.connect(
                `changed::${TEMPERATURE_KEY}`, () => this._sync()));

        // Modify night light temperature when slider is slided
        this._connections.push(
            this.slider.connect('notify::value', 
                this._sliderChanged.bind(this)));

        this.slider.accessible_name = _('Night Light');

        // 
        // Initializing the slider with the temperature startup value
        this._sync();
    }

    _updateVisibity() {
        const enable = this._settings.get_boolean(ENABLE_KEY);
        this.visible = enable;
    }

    /**
     * Sliding the slider adjust the night light temperature
     */
    _sliderChanged() {
        const value = this.slider.value;
        const temperature = TemperatureUtils.denormalize(value);
        this._settings.set_uint(TEMPERATURE_KEY, temperature);
    }

    /**
     * Initialize, modify slider position reading system temperature value
     */
    _sync() {
        const temperature = this._settings.get_uint(TEMPERATURE_KEY);
        const value = TemperatureUtils.normalize(temperature);
        this.slider.value = value;
    }

    /**
     * Disconnects all saved signals
     */
    destroy() {
        /**
        The last signal is always disconnected by something,
        this raise an error in logs. Bug fix will follow.
        Capire come funzionano i segnali in GObject
        Capire come Gio.Settings gestisce i segnali
        */
        this._connections.forEach(id => this._settings.disconnect(id));   
        this._connections = [];
        super.destroy();
    }
});

const Indicator = GObject.registerClass(
class Indicator extends SystemIndicator {
    _init() {
        super._init();

        const item = new NightLightItem()
        this.quickSettingsItems.push(item);

        const colSpan = 2;

        /* mi ha dato un'errore c'é non trovata il brightness, bisogna agggiungere
        un controllo, se non è ancora stato inizializzato, tipo un ritardo
        è come se ricaricando gnome, con l'estensione accesa, non trovasse lo slider
        luminosità e lo segnala come undefined.
        */
        
        const brightnessItem = quickSettings._brightness.quickSettingsItems[0];
        const items = quickSettings.menu._grid.get_children();
        const brightnessIndex = items.indexOf(brightnessItem);
        const nextItem = brightnessIndex >= 0 ? items[brightnessIndex + 1] : null;

        if (brightnessItem && nextItem) {
            extLog(`Indicator added after the Brightness Slider.`)
            quickSettings.menu.insertItemBefore(
                item, 
                nextItem,
                colSpan
            )
        }
        else {
            extLog(`Indicator added at bottom of Quick Settings.`);
            quickSettings.addExternalIndicator(this, colSpan);
        }
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        this.quickSettingsItems = [];
        super.destroy();
    }
});



export default class NightLightSliderExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
    }

    enable() {
        extLog(`Extension enabled`);
        if(!this._indicator) {
            this._indicator = new Indicator();
        }
    }

    disable() {
        extLog(`Extension disabled`);
        if(this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
