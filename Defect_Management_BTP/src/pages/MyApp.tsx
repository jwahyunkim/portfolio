// src/renderer/pages/MyApp.tsx
import { JSX, } from 'react'
import { Card, Text, TabContainer, Tab, Icon } from '@ui5/webcomponents-react'
import factory from '@ui5/webcomponents-icons/dist/factory.js'
import { useNavigate } from 'react-router-dom'

export function MyApp(): JSX.Element | null {
    const navigate = useNavigate()

    return (
        <div style={{ padding: "1rem" }}>
            <TabContainer collapsed={false}>
                <Tab text="QM">
                    <div style={{ padding: "1rem" }}>
                        <Text style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                            Defect Management
                        </Text>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                marginTop: "1rem",
                            }}
                        >
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/btm-int");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    Bottom Internal
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/btm-ent");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    Bottom External
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/lean-line-int");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    VSM Internal
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/lean-line-ent");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    VSM External
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/VJ2_VJ3-int");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    VJ2 & VJ3 Internal
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/upstream-int");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    Upstream Internal
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/bonding");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    Bonding
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                             <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./defect/hfpa");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    HFPA
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./dbtest");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    dbtest
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                        </div>
                    </div>
                    <div style={{ padding: "1rem" }}>
                        <Text style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                            Return Management
                        </Text>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                marginTop: "1rem",
                            }}
                        >

                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./return");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    Confirm
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>
                            <Card
                                style={{
                                    width: "180px",
                                    height: "180px",
                                    margin: "1rem",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                                    cursor: "pointer",
                                    position: "relative"
                                }}
                                onClick={() => {
                                    void navigate("./scrap-rework");
                                }}
                            >
                                <Text style={{ fontWeight: "bold", fontSize: "1rem", margin: "1rem" }}>
                                    Scrap/Rework
                                </Text>
                                <Icon
                                    name={factory}
                                    style={{
                                        width: "2rem",
                                        height: "2rem",
                                        position: "absolute",
                                        bottom: "1.5rem",
                                        left: "1.5rem",
                                        color: "#0a6ed1",
                                    }}
                                />
                            </Card>


                        </div>
                    </div>
                </Tab>
            </TabContainer>
        </div>
    );
}
