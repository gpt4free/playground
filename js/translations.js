

function btnTranslate(btn) {
    if (localStorage.getItem(framework.translationKey)) {
        localStorage.removeItem(framework.translationKey);
        window.location.reload();
        return;
    }
    btn.textContent = framework.translate('⏳ Translating');
    let dotCount = 0;
    const interval = setInterval(() => {
        btn.textContent = framework.translate('⏳ Translating') + '.'.repeat((dotCount + 1) % 4);
        dotCount = (dotCount + 1) % 4;
    }, 500);
    btn.disabled = true;
    framework.translateAll()
        .then(result => {
            if (result) {
                window.location.reload();
            } else {
                clearInterval(interval);
                btn.textContent = framework.translate('🌐');
                btn.disabled = false;
            }
        })
        .catch(() => {
            clearInterval(interval);
            btn.textContent = framework.translate('🌐');
            btn.disabled = false;
        });
}
