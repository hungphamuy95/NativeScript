﻿import {
    SegmentedBarItemBase, SegmentedBarBase, selectedIndexProperty, itemsProperty, selectedBackgroundColorProperty,
    colorProperty, fontInternalProperty, fontSizeProperty, Color, Font, initNativeView
} from "./segmented-bar-common";

export * from "./segmented-bar-common";

const R_ID_TABS = 0x01020013;
const R_ID_TABCONTENT = 0x01020011;
const R_ATTR_STATE_SELECTED = 0x010100a1;
const TITLE_TEXT_VIEW_ID = 16908310; // http://developer.android.com/reference/android/R.id.html#title

let apiLevel: number;
// TODO: Move this into widgets.
let SegmentedBarColorDrawableClass;
function ensureSegmentedBarColorDrawableClass() {
    if (SegmentedBarColorDrawableClass) {
        return;
    }

    apiLevel = android.os.Build.VERSION.SDK_INT;

    class SegmentedBarColorDrawable extends android.graphics.drawable.ColorDrawable {
        constructor(arg: any) {
            super(arg);

            return global.__native(this);
        }

        public draw(canvas: android.graphics.Canvas): void {
            let p = new android.graphics.Paint();
            p.setColor(this.getColor());
            p.setStyle(android.graphics.Paint.Style.FILL);
            canvas.drawRect(0, this.getBounds().height() - 15, this.getBounds().width(), this.getBounds().height(), p);
        }
    }

    SegmentedBarColorDrawableClass = SegmentedBarColorDrawable;
}

function setBackground(view: android.view.View, background: android.graphics.drawable.Drawable): void {
    if (apiLevel >= 16) {
        view.setBackground(background);
    } else {
        view.setBackgroundDrawable(background);
    }
}

export class SegmentedBarItem extends SegmentedBarItemBase {
    private _textView: android.widget.TextView;

    get nativeView(): android.widget.TextView {
        return this._textView;
    }

    get android(): android.widget.TextView {
        return this._textView;
    }

    public setupNativeView(tabIndex: number): void {
        // TabHost.TabSpec.setIndicator DOES NOT WORK once the title has been set.
        // http://stackoverflow.com/questions/2935781/modify-tab-indicator-dynamically-in-android
        const titleTextView = <android.widget.TextView>this.parent.android.getTabWidget().getChildAt(tabIndex).findViewById(TITLE_TEXT_VIEW_ID);

        this._textView = titleTextView;
        if (titleTextView) {
            initNativeView(this);
            if (this.titleDirty) {
                this._update();
            }
        }
    }

    private titleDirty: boolean;
    public _update(): void {
        const tv = this._textView;
        if (tv) {
            let title = this.title;
            title = (title === null || title === undefined) ? "" : title;
            tv.setText(title);
            this.titleDirty = false;
        } else {
            this.titleDirty = true;
        }
    }

    get [colorProperty.native](): number {
        return this._textView.getCurrentTextColor();
    }
    set [colorProperty.native](value: Color | number) {
        let color = value instanceof Color ? value.android : value;
        this._textView.setTextColor(color);
    }

    get [fontSizeProperty.native](): { nativeSize: number } {
        return { nativeSize: this._textView.getTextSize() };
    }
    set [fontSizeProperty.native](value: number | { nativeSize: number }) {
        if (typeof value === "number") {
            this._textView.setTextSize(value);
        } else {
            this._textView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, value.nativeSize);
        }
    }

    get [fontInternalProperty.native](): android.graphics.Typeface {
        return this._textView.getTypeface();
    }
    set [fontInternalProperty.native](value: Font | android.graphics.Typeface) {
        this._textView.setTypeface(value instanceof Font ? value.getAndroidTypeface() : value);
    }

    get [selectedBackgroundColorProperty.native](): android.graphics.drawable.Drawable {
        let viewGroup = <android.view.ViewGroup>this._textView.getParent();
        return viewGroup.getBackground();
    }
    set [selectedBackgroundColorProperty.native](value: Color | android.graphics.drawable.Drawable) {
        let viewGroup = <android.view.ViewGroup>this._textView.getParent();
        if (value instanceof Color) {
            let color = value.android;
            let backgroundDrawable = viewGroup.getBackground();
            if (apiLevel > 21 && backgroundDrawable && typeof backgroundDrawable.setColorFilter === "function") {
                backgroundDrawable.setColorFilter(color, android.graphics.PorterDuff.Mode.SRC_IN);
            } else {
                let stateDrawable = new android.graphics.drawable.StateListDrawable();

                let arr = Array.create("int", 1);
                arr[0] = R_ATTR_STATE_SELECTED;
                let colorDrawable: android.graphics.drawable.ColorDrawable = new SegmentedBarColorDrawableClass(color);
                stateDrawable.addState(arr, colorDrawable);
                stateDrawable.setBounds(0, 15, viewGroup.getRight(), viewGroup.getBottom());

                setBackground(viewGroup, stateDrawable);
            }
        } else {
            setBackground(viewGroup, value);
        }
    }
}

@Interfaces([android.widget.TabHost.OnTabChangeListener])
class TabChangeListener extends java.lang.Object implements android.widget.TabHost.OnTabChangeListener {
    constructor(private owner: WeakRef<SegmentedBar>) {
        super();
        return global.__native(this);
    }

    onTabChanged(id: string): void {
        let owner = this.owner.get();
        if (owner && owner.shouldChangeSelectedIndex()) {
            owner.selectedIndex = parseInt(id);
        }
    }
}

@Interfaces([android.widget.TabHost.TabContentFactory])
class TabContentFactory extends java.lang.Object implements android.widget.TabHost.TabContentFactory {
    constructor(private owner: WeakRef<SegmentedBar>) {
        super();
        return global.__native(this);
    }

    createTabContent(tag: string): android.view.View {
        let owner = this.owner.get();
        if (owner) {
            let tv = new android.widget.TextView(owner._context);
            // This is collapsed by default and made visible 
            // by android when TabItem becomes visible/selected.
            // TODO: Try commenting visibility change.
            tv.setVisibility(android.view.View.GONE);
            tv.setMaxLines(1);
            tv.setEllipsize(android.text.TextUtils.TruncateAt.END);
            return tv;
        } else {
            throw new Error(`Invalid owner: ${this.owner}`);
        }
    }
}

export class SegmentedBar extends SegmentedBarBase {
    private _android: android.widget.TabHost;
    private listener: android.widget.TabHost.OnTabChangeListener;
    private tabContentFactory: android.widget.TabHost.TabContentFactory;
    private _addingTab: boolean;

    public shouldChangeSelectedIndex(): boolean {
        return !this._addingTab;
    }

    public _createNativeView() {
        ensureTabHostClass();
        ensureSegmentedBarColorDrawableClass();

        let weakRef = new WeakRef(this);
        this._android = new TabHostClass(this._context, null);

        this.listener = this.listener || new TabChangeListener(weakRef);
        this.tabContentFactory = this.tabContentFactory || new TabContentFactory(weakRef);

        const tabHostLayout = new android.widget.LinearLayout(this._context);
        tabHostLayout.setOrientation(android.widget.LinearLayout.VERTICAL);

        const tabWidget = new android.widget.TabWidget(this._context);
        tabWidget.setId(R_ID_TABS);
        tabHostLayout.addView(tabWidget);

        const frame = new android.widget.FrameLayout(this._context);
        frame.setId(R_ID_TABCONTENT);
        frame.setVisibility(android.view.View.GONE);
        tabHostLayout.addView(frame);

        this._android.addView(tabHostLayout);
        this._android.setup();
        this._android.setOnTabChangedListener(this.listener);
    }

    get android(): android.widget.TabHost {
        return this._android;
    }

    private insertTab(tabItem: SegmentedBarItem, index: number): void {
        const tab = this.android.newTabSpec(index + "");
        tab.setIndicator(tabItem.title + "");
        tab.setContent(this.tabContentFactory);

        let tabHost = this.android;
        this._addingTab = true;
        tabHost.addTab(tab);
        tabItem.setupNativeView(index);
        this._addingTab = false;
    }

    get [selectedIndexProperty.native](): number {
        return -1;
    }
    set [selectedIndexProperty.native](value: number) {
        this._android.setCurrentTab(value);
    }

    get [itemsProperty.native](): SegmentedBarItem[] {
        return null;
    }
    set [itemsProperty.native](value: SegmentedBarItem[]) {
        this._android.clearAllTabs();

        const newItems = value;
        if (newItems) {
            newItems.forEach((item, i, arr) => this.insertTab(item, i));
        }
    }
}

let TabHostClass;
function ensureTabHostClass() {
    if (TabHostClass) {
        return;
    }

    class OurTabHost extends android.widget.TabHost {
        constructor(context: any, attrs: any) {
            super(context, attrs);

            return global.__native(this);
        }

        protected onAttachedToWindow(): void {
            // overriden to remove the code that will steal the focus from edit fields.
        }
    }

    TabHostClass = OurTabHost;
}
