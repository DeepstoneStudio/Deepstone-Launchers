/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

import { config, status, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js';
const { Launch } = require('minecraft-java-core');
const { shell, ipcRenderer } = require('electron');
import { skin2D } from '../utils/skin.js';

class Home {
    static id = "home";

    async init(config) {
        this.config = config;
        this.db = new database();

        // Initialisation composants
        this.news();
        this.socialClick();
        this.instancesSelect();

        // Bouton settings
        document.querySelector('.settings-btn').addEventListener('click', () => changePanel('settings'));

        // Animation bouton Jouer
        document.querySelector('.play-btn').classList.add('pulse');

        // Ping serveur automatique
        this.pingServer();
    }

    async pingServer(host = 'java.deepstone.fr', port = 25565, interval = 10000) {
        const statusBadge = document.querySelector('.status-player-count');
        const statusText = document.querySelector('.server-status-text');

        const check = async () => {
            try {
                const res = await status(host, port);
                const players = res.players.online;

                statusBadge.classList.remove('offline');
                statusBadge.classList.add('online');
                statusText.classList.remove('red');
                statusText.textContent = `En ligne - ${players} joueur(s)`;
            } catch (err) {
                statusBadge.classList.remove('online');
                statusBadge.classList.add('offline');
                statusText.classList.add('red');
                statusText.textContent = 'Hors ligne';
            }
        }

        check();
        setInterval(check, interval);
    }

    async news() {
        const newsElement = document.querySelector('.news-list');
        const news = await config.getNews(this.config).catch(() => false);

        const createNewsBlock = (title, content, author = null, date = new Date()) => {
            const block = document.createElement('div');
            const d = this.getDate(date);
            block.classList.add('news-block');
            block.innerHTML = `
                <div class="news-header">
                    <img class="server-status-icon" src="assets/images/icon/icon.png">
                    <div class="header-text">
                        <div class="title">${title}</div>
                    </div>
                    <div class="date">
                        <div class="day">${d.day}</div>
                        <div class="month">${d.month}</div>
                    </div>
                </div>
                <div class="news-content">
                    <div class="bbWrapper">
                        <p>${content.replace(/\n/g,'<br>')}</p>
                        ${author ? `<p class="news-author">Auteur - <span>${author}</span></p>` : ''}
                    </div>
                </div>`;
            newsElement.appendChild(block);
        }

        if (!news) createNewsBlock("Erreur","Impossible de contacter le serveur des news.");
        else if (!news.length) createNewsBlock("Aucune news disponible","Vous pourrez suivre ici toutes les news relatives au serveur.");
        else for (let item of news) createNewsBlock(item.title, item.content, item.author, item.publish_date);
    }

    socialClick() {
        const socials = document.querySelectorAll('.social-block');
        socials.forEach(s => {
            s.addEventListener('click', () => shell.openExternal(s.dataset.url));
            s.addEventListener('mouseenter', e => { e.currentTarget.style.transform='scale(1.1) translateY(-3px)'; e.currentTarget.style.transition='all 0.3s ease'; });
            s.addEventListener('mouseleave', e => { e.currentTarget.style.transform='scale(1)'; });
        });
    }

    async instancesSelect() {
        const configClient = await this.db.readData('configClient');
        const auth = await this.db.readData('accounts', configClient.account_selected);
        const instancesList = await config.getInstanceList();
        let instanceSelect = instancesList.find(i => i.name === configClient.instance_select)?.name || null;

        const instanceBTN = document.querySelector('.play-instance');
        const instancePopup = document.querySelector('.instance-popup');
        const instancesListPopup = document.querySelector('.instances-List');
        const instanceCloseBTN = document.querySelector('.close-popup');

        if (instancesList.length===1){ document.querySelector('.instance-select').style.display='none'; instanceBTN.style.paddingRight='0'; }

        if (!instanceSelect){
            const newInstance = instancesList.find(i=>!i.whitelistActive);
            configClient.instance_select = newInstance.name;
            instanceSelect = newInstance.name;
            await this.db.updateData('configClient', configClient);
        }

        for (let instance of instancesList){
            if (instance.whitelistActive && !instance.whitelist.includes(auth?.name)){
                if (instance.name===instanceSelect){
                    const newInstance = instancesList.find(i=>!i.whitelistActive);
                    configClient.instance_select = newInstance.name;
                    instanceSelect = newInstance.name;
                    setStatus(newInstance.status);
                    await this.db.updateData('configClient', configClient);
                }
            } else console.log(`Initializing instance ${instance.name}...`);
            if (instance.name===instanceSelect) setStatus(instance.status);
        }

        // Popup choix instance
        instancePopup.addEventListener('click', async e => {
            if (e.target.classList.contains('instance-elements')){
                const newInstance = e.target.id;
                document.querySelector('.active-instance')?.classList.remove('active-instance');
                e.target.classList.add('active-instance');
                configClient.instance_select = newInstance;
                await this.db.updateData('configClient', configClient);
                const selected = (await config.getInstanceList()).find(i=>i.name===newInstance);
                await setStatus(selected.status);
                instancePopup.style.display='none';
            }
        });

        instanceBTN.addEventListener('click', async e => {
            if (e.target.classList.contains('instance-select')){
                instancesListPopup.innerHTML='';
                for (let instance of instancesList){
                    if (!instance.whitelistActive || instance.whitelist.includes(auth?.name)){
                        const activeClass = instance.name===instanceSelect ? 'active-instance':'';
                        instancesListPopup.innerHTML+=`<div id="${instance.name}" class="instance-elements ${activeClass}">${instance.name}</div>`;
                    }
                }
                instancePopup.style.display='flex';
            } else this.startGame();
        });

        instanceCloseBTN.addEventListener('click', ()=> instancePopup.style.display='none');
    }

    async startGame() {
        const launch = new Launch();
        const configClient = await this.db.readData('configClient');
        const instance = await config.getInstanceList();
        const auth = await this.db.readData('accounts', configClient.account_selected);
        const options = instance.find(i=>i.name===configClient.instance_select);

        const playBTN = document.querySelector('.play-instance');
        const infoBOX = document.querySelector('.info-starting-game');
        const infoText = document.querySelector('.info-starting-game-text');
        const progressBar = document.querySelector('.progress-bar');

        const opt = {
            url: options.url,
            authenticator: auth,
            timeout:10000,
            path:`${await appdata()}/${process.platform==='darwin'? this.config.dataDirectory:`.${this.config.dataDirectory}`}`,
            instance: options.name,
            version: options.loader.minecraft_version,
            detached: configClient.launcher_config.closeLauncher!=='close-all',
            downloadFileMultiple: configClient.launcher_config.download_multi,
            intelEnabledMac: configClient.launcher_config.intelEnabledMac,
            loader:{ type: options.loader.loader_type, build: options.loader.loader_version, enable: options.loader.loader_type!=='none' },
            verify: options.verify,
            ignored:[...options.ignored],
            java:{ path: configClient.java_config.java_path },
            JVM_ARGS: options.jvm_args||[],
            GAME_ARGS: options.game_args||[],
            screen:{ width: configClient.game_config.screen_size.width, height: configClient.game_config.screen_size.height },
            memory:{ min:`${configClient.java_config.java_memory.min*1024}M`, max:`${configClient.java_config.java_memory.max*1024}M` }
        };

        launch.Launch(opt);

        playBTN.style.display="none";
        infoBOX.style.display="block";
        progressBar.style.display="";
        ipcRenderer.send('main-window-progress-load');

        launch.on('progress', (progress,size)=>{
            infoText.innerHTML=`Téléchargement ${((progress/size)*100).toFixed(0)}%`;
            progressBar.value=progress;
            progressBar.max=size;
            ipcRenderer.send('main-window-progress',{progress,size});
        });
        launch.on('check', (progress,size)=>{
            infoText.innerHTML=`Vérification ${((progress/size)*100).toFixed(0)}%`;
            progressBar.value=progress;
            progressBar.max=size;
            ipcRenderer.send('main-window-progress',{progress,size});
        });
        launch.on('patch', patch => infoText.innerHTML='Patch en cours...');
        launch.on('data', e=>{
            progressBar.style.display="none";
            if (configClient.launcher_config.closeLauncher==='close-launcher') ipcRenderer.send('main-window-hide');
            new logger('Minecraft','#36b030');
            infoText.innerHTML='Démarrage en cours...';
        });
        launch.on('close', code=>{
            if (configClient.launcher_config.closeLauncher==='close-launcher') ipcRenderer.send('main-window-show');
            ipcRenderer.send('main-window-progress-reset');
            infoBOX.style.display="none";
            playBTN.style.display="flex";
            infoText.innerHTML='Vérification';
        });
        launch.on('error', err=>{
            new popup().openPopup({title:'Erreur', content:err.error, color:'red', options:true});
            ipcRenderer.send('main-window-progress-reset');
            infoBOX.style.display="none";
            playBTN.style.display="flex";
            infoText.innerHTML='Vérification';
        });
    }

    getDate(e){
        const date = new Date(e);
        const allMonth=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
        return { year:date.getFullYear(), month:allMonth[date.getMonth()], day:date.getDate() };
    }
}

export default Home;