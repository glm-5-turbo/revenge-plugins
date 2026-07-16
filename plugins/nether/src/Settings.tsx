import { Forms } from "@vendetta/ui/components";
const { FormSection, FormRow, FormSwitch } = Forms;

export default () => {
    return (
        <FormSection title="Nether">
            <FormRow
                label="Test Toggle"
                trailing={<FormSwitch value={false} onValueChange={() => {}} />}
            />
        </FormSection>
    );
};
